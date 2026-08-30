// PostgreSQL-backed append-only candle storage and the durable MarketDataQuery adapter.
// Local revisions preserve history; a globally coordinated ingest sequence makes
// DatasetRef watermarks stable even when writes for different candles overlap.

import type { Pool } from "pg";
import type {
  MarketDataQuery,
  MarketDataRangeRequest
} from "../application/market-data-query.js";
import type {
  MarketGapQuery,
  MarketGapRangeRequest,
  MarketGapReport
} from "../application/market-gap-query.js";
import type {
  MarketSnapshot,
  MarketSnapshotQuery,
  MarketSnapshotRequest
} from "../application/market-snapshot-query.js";
import {
  assertHistoricalCandleSeries,
  timeframeDurationMs,
  type Candle
} from "../domain/candle.js";
import { findMissingRanges } from "../domain/dataset-policy.js";

interface CandleRow {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Candle["timeframe"];
  readonly open_time: string;
  readonly close_time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closed: boolean;
  readonly revision: string;
  readonly ingest_sequence: string;
}

/** One stored revision plus the storage-only sequence dataset watermarks use. */
export interface StoredCandleRevision {
  readonly candle: Candle;
  readonly ingestSequence: number;
}

const WRITE_LOCK_NAME = "market.candles.write-and-watermark";

function mapRow(row: CandleRow): StoredCandleRevision {
  return {
    candle: {
      provider: row.provider,
      symbol: row.symbol,
      timeframe: row.timeframe,
      openTime: Number(row.open_time),
      closeTime: Number(row.close_time),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      closed: row.closed,
      revision: Number(row.revision)
    },
    ingestSequence: Number(row.ingest_sequence)
  };
}

function assertRangeRequest(request: MarketDataRangeRequest): void {
  if (!Number.isSafeInteger(request.startTime) || !Number.isSafeInteger(request.endTime)) {
    throw new Error("MARKET_RANGE_TIME: startTime and endTime must be safe integers");
  }
  if (request.startTime > request.endTime) {
    throw new Error("MARKET_RANGE_ORDER: startTime must be less than or equal to endTime");
  }
  if (
    request.revisionWatermark !== undefined &&
    (!Number.isSafeInteger(request.revisionWatermark) || request.revisionWatermark < 0)
  ) {
    throw new Error("MARKET_REVISION_WATERMARK: revisionWatermark must be a non-negative safe integer");
  }
}

const CANDLE_COLUMNS = `
  provider, symbol, timeframe, open_time, close_time,
  open, high, low, close, volume, closed, revision, ingest_sequence
`;

/** Internal SQL adapter; consumers outside Market Data receive only its read ports. */
export class PostgresCandleRepository
implements MarketDataQuery, MarketSnapshotQuery, MarketGapQuery {
  constructor(private readonly pool: Pool) {}

  async append(candle: Candle): Promise<Candle> {
    const [stored] = await this.appendMany([candle]);
    if (stored === undefined) {
      throw new Error("MARKET_CANDLE_APPEND: append unexpectedly returned no candle");
    }
    return stored;
  }

  /**
   * Commits one closed live candle and reports the sequence it was stored at.
   *
   * Live ingest needs the sequence to publish a notification a client can order
   * against its durable snapshot. A repeated identical candle inserts no new
   * revision and reports the sequence the existing revision already carries, so
   * a restarted ingest process cannot create a duplicate.
   */
  async appendClosed(candle: Candle): Promise<StoredCandleRevision> {
    const [stored] = await this.insertRevisions([candle]);
    if (stored === undefined) {
      throw new Error("MARKET_CANDLE_APPEND: append unexpectedly returned no candle");
    }
    return stored;
  }

  /** Set-based transactional insert path used by historical backfill. */
  async appendMany(candles: readonly Candle[]): Promise<readonly Candle[]> {
    return (await this.insertRevisions(candles)).map((stored) => stored.candle);
  }

  private async insertRevisions(
    candles: readonly Candle[]
  ): Promise<readonly StoredCandleRevision[]> {
    assertHistoricalCandleSeries(candles);
    if (candles.length === 0) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        WRITE_LOCK_NAME
      ]);
      const result = await client.query<CandleRow>(
        `
          WITH incoming AS (
            SELECT
              entry.ordinality,
              entry.value->>'provider' AS provider,
              entry.value->>'symbol' AS symbol,
              entry.value->>'timeframe' AS timeframe,
              (entry.value->>'openTime')::bigint AS open_time,
              (entry.value->>'closeTime')::bigint AS close_time,
              (entry.value->>'open')::double precision AS open,
              (entry.value->>'high')::double precision AS high,
              (entry.value->>'low')::double precision AS low,
              (entry.value->>'close')::double precision AS close,
              (entry.value->>'volume')::double precision AS volume,
              (entry.value->>'closed')::boolean AS closed
            FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS entry(value, ordinality)
          ),
          compared AS (
            SELECT
              incoming.*,
              current.close_time AS previous_close_time,
              current.open AS previous_open,
              current.high AS previous_high,
              current.low AS previous_low,
              current.close AS previous_close,
              current.volume AS previous_volume,
              current.closed AS previous_closed,
              current.revision AS previous_revision,
              current.ingest_sequence AS previous_ingest_sequence
            FROM incoming
            LEFT JOIN LATERAL (
              SELECT
                close_time, open, high, low, close, volume, closed,
                revision, ingest_sequence
              FROM market.candles
              WHERE provider = incoming.provider
                AND symbol = incoming.symbol
                AND timeframe = incoming.timeframe
                AND open_time = incoming.open_time
              ORDER BY revision DESC
              LIMIT 1
            ) AS current ON true
          ),
          inserted AS (
            INSERT INTO market.candles (
              provider, symbol, timeframe, open_time, close_time,
              open, high, low, close, volume, closed, revision
            )
            SELECT
              provider, symbol, timeframe, open_time, close_time,
              open, high, low, close, volume, closed,
              COALESCE(previous_revision, 0) + 1
            FROM compared
            WHERE previous_revision IS NULL
              OR ROW(close_time, open, high, low, close, volume, closed)
                 IS DISTINCT FROM
                 ROW(
                   previous_close_time, previous_open, previous_high, previous_low,
                   previous_close, previous_volume, previous_closed
                 )
            RETURNING ${CANDLE_COLUMNS}
          )
          SELECT
            compared.provider,
            compared.symbol,
            compared.timeframe,
            compared.open_time,
            COALESCE(inserted.close_time, compared.previous_close_time) AS close_time,
            COALESCE(inserted.open, compared.previous_open) AS open,
            COALESCE(inserted.high, compared.previous_high) AS high,
            COALESCE(inserted.low, compared.previous_low) AS low,
            COALESCE(inserted.close, compared.previous_close) AS close,
            COALESCE(inserted.volume, compared.previous_volume) AS volume,
            COALESCE(inserted.closed, compared.previous_closed) AS closed,
            COALESCE(inserted.revision, compared.previous_revision) AS revision,
            COALESCE(inserted.ingest_sequence, compared.previous_ingest_sequence) AS ingest_sequence
          FROM compared
          LEFT JOIN inserted USING (provider, symbol, timeframe, open_time)
          ORDER BY compared.ordinality
        `,
        [JSON.stringify(candles)]
      );
      await client.query("COMMIT");
      return result.rows.map(mapRow);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentRevisionWatermark(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        WRITE_LOCK_NAME
      ]);
      const result = await client.query<{ watermark: string }>(
        "SELECT COALESCE(MAX(ingest_sequence), 0)::text AS watermark FROM market.candles"
      );
      await client.query("COMMIT");
      return Number(result.rows[0]?.watermark ?? 0);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Smallest stable watermark that still contains the current state of one range. */
  async getRangeRevisionWatermark(request: MarketDataRangeRequest): Promise<number> {
    assertRangeRequest(request);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        WRITE_LOCK_NAME
      ]);
      const result = await client.query<{ watermark: string }>(
        `
          SELECT COALESCE(MAX(ingest_sequence), 0)::text AS watermark
          FROM market.candles
          WHERE provider = $1 AND symbol = $2 AND timeframe = $3
            AND open_time BETWEEN $4 AND $5
        `,
        [request.provider, request.symbol, request.timeframe, request.startTime, request.endTime]
      );
      await client.query("COMMIT");
      return Number(result.rows[0]?.watermark ?? 0);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCandles(request: MarketDataRangeRequest): Promise<readonly Candle[]> {
    assertRangeRequest(request);
    const result = await this.pool.query<CandleRow>(
      `
        SELECT DISTINCT ON (provider, symbol, timeframe, open_time)
          ${CANDLE_COLUMNS}
        FROM market.candles
        WHERE provider = $1
          AND symbol = $2
          AND timeframe = $3
          AND open_time BETWEEN $4 AND $5
          AND ($6::bigint IS NULL OR ingest_sequence <= $6)
        ORDER BY provider, symbol, timeframe, open_time, revision DESC
      `,
      [
        request.provider,
        request.symbol,
        request.timeframe,
        request.startTime,
        request.endTime,
        request.revisionWatermark ?? null
      ]
    );
    return result.rows.map((row) => mapRow(row).candle);
  }

  /**
   * Reports which aligned intervals the range is still missing.
   *
   * It reads the current state, with no revision watermark, because the
   * question is about the stream as it stands now rather than about what some
   * snapshot saw. The absent-interval arithmetic is `findMissingRanges`, the
   * same function dataset creation uses, so the two can never disagree.
   */
  async findGaps(request: MarketGapRangeRequest): Promise<MarketGapReport> {
    const duration = timeframeDurationMs(request.timeframe);
    if (request.startTime % duration !== 0 || request.endTime % duration !== 0) {
      throw new Error(
        `MARKET_GAP_ALIGNMENT: range must align to ${request.timeframe} candle open times`
      );
    }
    assertRangeRequest(request);
    const candles = await this.getCandles(request);
    const gaps = findMissingRanges(
      request.timeframe,
      { startTime: request.startTime, endTime: request.endTime },
      candles
    );
    const missingCandleCount = gaps.reduce((total, gap) => total + gap.missingCandleCount, 0);
    return {
      provider: request.provider,
      symbol: request.symbol,
      timeframe: request.timeframe,
      startTime: request.startTime,
      endTime: request.endTime,
      expectedCandleCount: (request.endTime - request.startTime) / duration + 1,
      presentCandleCount: candles.length,
      gaps,
      missingCandleCount,
      resolved: gaps.length === 0
    };
  }

  /**
   * Newest committed closed-candle open time for one stream, or `undefined`.
   *
   * This is the lower boundary gap recovery starts from. It reads open time
   * rather than ingest sequence on purpose: the gap is a question about market
   * time, not about storage order.
   */
  async getLatestCommittedOpenTime(request: {
    readonly provider: string;
    readonly symbol: string;
    readonly timeframe: Candle["timeframe"];
  }): Promise<number | undefined> {
    const result = await this.pool.query<{ open_time: string | null }>(
      `
        SELECT MAX(open_time)::text AS open_time
        FROM market.candles
        WHERE provider = $1 AND symbol = $2 AND timeframe = $3
      `,
      [request.provider, request.symbol, request.timeframe]
    );
    const openTime = result.rows[0]?.open_time;
    return openTime === null || openTime === undefined ? undefined : Number(openTime);
  }

  async getLatestSnapshot(request: MarketSnapshotRequest): Promise<MarketSnapshot> {
    if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 10_000) {
      throw new Error("MARKET_SNAPSHOT_LIMIT: limit must be between 1 and 10000");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        WRITE_LOCK_NAME
      ]);
      const watermark = await client.query<{ watermark: string }>(
        `SELECT COALESCE(MAX(ingest_sequence), 0)::text AS watermark
         FROM market.candles WHERE provider = $1 AND symbol = $2 AND timeframe = $3`,
        [request.provider, request.symbol, request.timeframe]
      );
      const result = await client.query<CandleRow>(
        `
          WITH current_candles AS (
            SELECT DISTINCT ON (provider, symbol, timeframe, open_time) ${CANDLE_COLUMNS}
            FROM market.candles
            WHERE provider = $1 AND symbol = $2 AND timeframe = $3
            ORDER BY provider, symbol, timeframe, open_time, revision DESC
          ), latest AS (
            SELECT * FROM current_candles ORDER BY open_time DESC LIMIT $4
          )
          SELECT * FROM latest ORDER BY open_time ASC
        `,
        [request.provider, request.symbol, request.timeframe, request.limit]
      );
      await client.query("COMMIT");
      return {
        candles: result.rows.map((row) => mapRow(row).candle),
        revisionWatermark: Number(watermark.rows[0]?.watermark ?? 0)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
