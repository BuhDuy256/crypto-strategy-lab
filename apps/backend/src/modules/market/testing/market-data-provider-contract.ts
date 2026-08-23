// Reusable conformance suite for every MarketDataProvider adapter.
// Production and fake adapters cross the same seam and must satisfy the same rules.
import { describe, expect, it } from "vitest";
import { assertHistoricalCandleSeries } from "../domain/candle.js";
import type {
  HistoricalCandlesRequest,
  MarketDataProvider
} from "../application/market-data-provider.js";

export interface MarketDataProviderContractScenario {
  readonly provider: MarketDataProvider;
  readonly supportedRequest: HistoricalCandlesRequest;
  readonly unsupportedSymbolRequest: HistoricalCandlesRequest;
  readonly unsupportedTimeframeRequest: HistoricalCandlesRequest;
}

export async function verifyHistoricalProviderResponse(
  provider: MarketDataProvider,
  request: HistoricalCandlesRequest
): Promise<readonly import("../domain/candle.js").Candle[]> {
  const candles = await provider.fetchHistorical(request);
  assertHistoricalCandleSeries(candles);
  const health = await provider.getHealth();
  for (const candle of candles) {
    if (candle.provider !== health.provider) {
      throw new Error(
        `CANDLE_PROVIDER: expected provider ${health.provider}, got ${candle.provider}`
      );
    }
    if (candle.symbol !== request.symbol) {
      throw new Error(`CANDLE_SYMBOL: expected symbol ${request.symbol}, got ${candle.symbol}`);
    }
    if (candle.timeframe !== request.timeframe) {
      throw new Error(
        `CANDLE_TIMEFRAME: expected timeframe ${request.timeframe}, got ${candle.timeframe}`
      );
    }
    if (candle.openTime < request.startTime || candle.openTime > request.endTime) {
      throw new Error(
        `CANDLE_REQUEST_RANGE: openTime ${candle.openTime} is outside the requested range`
      );
    }
  }
  return candles;
}

export function defineMarketDataProviderContract(
  adapterName: string,
  createScenario: () => MarketDataProviderContractScenario
): void {
  describe(`${adapterName} market data provider contract`, () => {
    it("returns normalized historical candles in contract order", async () => {
      const { provider, supportedRequest } = createScenario();
      const candles = await verifyHistoricalProviderResponse(provider, supportedRequest);

      expect(candles.length).toBeGreaterThan(0);
    });

    it("returns a stable provider health shape", async () => {
      const { provider } = createScenario();
      const health = await provider.getHealth();

      expect(health.provider).not.toBe("");
      expect(["healthy", "degraded", "unavailable"]).toContain(health.status);
      expect(Number.isInteger(health.checkedAt)).toBe(true);
    });

    it("rejects an unsupported symbol with the stable error code", async () => {
      const { provider, unsupportedSymbolRequest } = createScenario();

      await expect(provider.fetchHistorical(unsupportedSymbolRequest)).rejects.toMatchObject({
        code: "UNSUPPORTED_SYMBOL"
      });
    });

    it("rejects an unsupported timeframe with the stable error code", async () => {
      const { provider, unsupportedTimeframeRequest } = createScenario();

      await expect(provider.fetchHistorical(unsupportedTimeframeRequest)).rejects.toMatchObject({
        code: "UNSUPPORTED_TIMEFRAME"
      });
    });
  });
}
