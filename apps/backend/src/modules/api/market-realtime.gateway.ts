// NestJS WebSocket transport for API-owned market subscriptions; no market business logic.

import type {
  MarketRealtimeMessage,
  MarketSnapshotMessage,
  MarketSubscribeMessage
} from "@crypto-strategy-lab/api-contracts";
import { isMarketRealtimeMessage } from "@crypto-strategy-lab/api-contracts";
import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import {
  MARKET_SNAPSHOT_QUERY,
  type MarketSnapshotQuery
} from "../market/index.js";
import { RedisLiveNotificationSubscriber } from "../../platform/realtime/redis-live-notifications.js";
import {
  MarketSubscriptionRegistry,
  type MarketClientSink,
  type MarketSnapshotReader
} from "./market-subscription-registry.js";

const SNAPSHOT_CANDLE_LIMIT = 150;

class DurableMarketSnapshotReader implements MarketSnapshotReader {
  constructor(private readonly query: MarketSnapshotQuery) {}

  async read(request: MarketSubscribeMessage): Promise<MarketSnapshotMessage> {
    const snapshot = await this.query.getLatestSnapshot({
      provider: "binance",
      symbol: request.symbol,
      timeframe: request.timeframe,
      limit: SNAPSHOT_CANDLE_LIMIT
    });
    return {
      schemaVersion: "v1",
      type: "market:snapshot",
      subscriptionId: request.subscriptionId,
      symbol: request.symbol,
      timeframe: request.timeframe,
      revisionWatermark: snapshot.revisionWatermark,
      candles: snapshot.candles
    };
  }
}

function socketSink(socket: Socket): MarketClientSink {
  return {
    send(message: MarketRealtimeMessage): boolean {
      if (
        !socket.connected ||
        !socket.conn.transport.writable
      ) return false;
      socket.emit("market:message", message);
      return true;
    },
    disconnect(): void {
      socket.disconnect(true);
    }
  };
}

@WebSocketGateway({ path: "/ws", transports: ["websocket"] })
export class MarketRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly registry: MarketSubscriptionRegistry;

  constructor(
    @Inject(MARKET_SNAPSHOT_QUERY) snapshots: MarketSnapshotQuery,
    @Inject(RedisLiveNotificationSubscriber) subscriber: RedisLiveNotificationSubscriber,
    @Inject("WS_OUTBOUND_BUFFER_MAX") maxOutboundMessages: number
  ) {
    this.registry = new MarketSubscriptionRegistry(
      new DurableMarketSnapshotReader(snapshots), maxOutboundMessages
    );
    void subscriber.start(
      (message) => this.registry.publish(message),
      () => this.registry.refreshAll()
    );
  }

  handleConnection(client: Socket): void {
    client.conn.transport.on("drain", () => this.registry.flush(client.id));
  }

  handleDisconnect(client: Socket): void {
    this.registry.disconnect(client.id);
  }

  @SubscribeMessage("market:subscribe")
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    if (!isMarketRealtimeMessage(body) || body.type !== "market:subscribe") {
      client.emit("market:error", { message: "Invalid market subscription" });
      return;
    }
    try {
      await this.registry.subscribe(
        client.id, body, socketSink(client)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Market subscription unavailable";
      client.emit("market:error", { subscriptionId: body.subscriptionId, message });
    }
  }

  @SubscribeMessage("market:unsubscribe")
  unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): void {
    if (!isMarketRealtimeMessage(body) || body.type !== "market:unsubscribe") return;
    this.registry.unsubscribe(client.id, body.subscriptionId);
  }
}
