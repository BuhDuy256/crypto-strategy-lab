// One shared SPA WebSocket client with per-subscription snapshot gating on reconnect.

import {
  isMarketRealtimeMessage,
  type MarketLiveMessage,
  type MarketSnapshotMessage,
  type MarketSubscribeMessage
} from "@crypto-strategy-lab/api-contracts";
import { io } from "socket.io-client";

export interface RealtimeSocket {
  readonly connected: boolean;
  on(event: string, handler: (body?: unknown) => void): void;
  emit(event: string, body: unknown): void;
}

export interface MarketSubscriptionRequest {
  readonly subscriptionId: string;
  readonly symbol: string;
  readonly timeframe: MarketSubscribeMessage["timeframe"];
}

export interface MarketSubscriptionHandlers {
  onSnapshot(message: MarketSnapshotMessage): void;
  onLive(message: MarketLiveMessage): void;
  onError(message: string): void;
}

interface ActiveSubscription {
  readonly request: MarketSubscribeMessage;
  readonly handlers: MarketSubscriptionHandlers;
  awaitingSnapshot: boolean;
}

export class MarketRealtimeClient {
  private readonly subscriptions = new Map<string, ActiveSubscription>();

  constructor(private readonly socket: RealtimeSocket) {
    socket.on("connect", () => this.resubscribeAll());
    socket.on("disconnect", () => {
      for (const subscription of this.subscriptions.values()) {
        subscription.awaitingSnapshot = true;
      }
    });
    socket.on("market:message", (body) => this.receive(body));
    socket.on("market:error", (body) => {
      if (typeof body !== "object" || body === null) return;
      const error = body as Readonly<Record<string, unknown>>;
      if (typeof error.subscriptionId !== "string" || typeof error.message !== "string") return;
      this.subscriptions.get(error.subscriptionId)?.handlers.onError(error.message);
    });
  }

  subscribe(
    request: MarketSubscriptionRequest,
    handlers: MarketSubscriptionHandlers
  ): () => void {
    const message: MarketSubscribeMessage = {
      schemaVersion: "v1",
      type: "market:subscribe",
      ...request
    };
    this.subscriptions.set(request.subscriptionId, {
      request: message,
      handlers,
      awaitingSnapshot: true
    });
    if (this.socket.connected) this.socket.emit("market:subscribe", message);
    return () => {
      if (!this.subscriptions.delete(request.subscriptionId)) return;
      this.socket.emit("market:unsubscribe", {
        schemaVersion: "v1", type: "market:unsubscribe",
        subscriptionId: request.subscriptionId
      });
    };
  }

  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.awaitingSnapshot = true;
      this.socket.emit("market:subscribe", subscription.request);
    }
  }

  private receive(body: unknown): void {
    if (!isMarketRealtimeMessage(body)) return;
    if (body.type === "market:snapshot") {
      const subscription = this.subscriptions.get(body.subscriptionId);
      if (subscription === undefined || !this.matches(subscription, body)) return;
      subscription.awaitingSnapshot = false;
      subscription.handlers.onSnapshot(body);
      return;
    }
    if (body.type === "market:refresh-required") {
      const subscription = this.subscriptions.get(body.subscriptionId);
      if (subscription === undefined) return;
      subscription.awaitingSnapshot = true;
      this.socket.emit("market:subscribe", subscription.request);
      return;
    }
    if (body.type !== "market:live") return;
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.awaitingSnapshot && this.matches(subscription, body)) {
        subscription.handlers.onLive(body);
      }
    }
  }

  private matches(
    subscription: ActiveSubscription,
    message: { readonly symbol: string; readonly timeframe: string }
  ): boolean {
    return subscription.request.symbol === message.symbol &&
      subscription.request.timeframe === message.timeframe;
  }
}

let sharedClient: MarketRealtimeClient | undefined;

export function getMarketRealtimeClient(): MarketRealtimeClient {
  sharedClient ??= new MarketRealtimeClient(io({ path: "/ws", transports: ["websocket"] }));
  return sharedClient;
}
