// API-owned client subscription state with snapshot-first ordering and bounded output.

import type {
  MarketLiveMessage,
  MarketRealtimeMessage,
  MarketSnapshotMessage,
  MarketSubscribeMessage
} from "@crypto-strategy-lab/api-contracts";

export interface MarketSnapshotReader {
  read(request: MarketSubscribeMessage): Promise<MarketSnapshotMessage>;
}

export interface MarketClientSink {
  send(message: MarketRealtimeMessage): boolean;
  disconnect(reason: "slow-client"): void;
}

interface SubscriptionState {
  readonly clientId: string;
  readonly request: MarketSubscribeMessage;
  readonly sink: MarketClientSink;
  readonly liveDuringSnapshot: MarketLiveMessage[];
  readonly outbound: MarketRealtimeMessage[];
  phase: "snapshot" | "live";
  watermark: number;
  liveSequence: number | undefined;
}

function matches(state: SubscriptionState, message: MarketLiveMessage): boolean {
  return state.request.symbol === message.symbol && state.request.timeframe === message.timeframe;
}

export class MarketSubscriptionRegistry {
  private readonly subscriptions = new Map<string, SubscriptionState>();

  constructor(
    private readonly snapshots: MarketSnapshotReader,
    private readonly maxOutboundMessages: number,
    private readonly maxSubscriptionsPerClient = 4
  ) {
    if (!Number.isSafeInteger(maxOutboundMessages) || maxOutboundMessages < 1) {
      throw new Error("WS_OUTBOUND_BUFFER_MAX must be a positive integer");
    }
    if (!Number.isSafeInteger(maxSubscriptionsPerClient) || maxSubscriptionsPerClient < 1) {
      throw new Error("WS_SUBSCRIPTION_MAX must be a positive integer");
    }
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  async subscribe(
    clientId: string,
    request: MarketSubscribeMessage,
    sink: MarketClientSink
  ): Promise<void> {
    const id = this.id(clientId, request.subscriptionId);
    if (!this.subscriptions.has(id) && this.countForClient(clientId) >= this.maxSubscriptionsPerClient) {
      throw new Error(`WS_SUBSCRIPTION_LIMIT: client may hold at most ${this.maxSubscriptionsPerClient}`);
    }
    const state: SubscriptionState = {
      clientId, request, sink, liveDuringSnapshot: [], outbound: [],
      phase: "snapshot", watermark: 0, liveSequence: undefined
    };
    this.subscriptions.set(id, state);
    await this.loadSnapshot(id, state);
  }

  unsubscribe(clientId: string, subscriptionId: string): void {
    this.subscriptions.delete(this.id(clientId, subscriptionId));
  }

  disconnect(clientId: string): void {
    for (const [id, state] of this.subscriptions) {
      if (state.clientId === clientId) this.subscriptions.delete(id);
    }
  }

  publish(message: MarketLiveMessage): void {
    for (const [id, state] of this.subscriptions) {
      if (!matches(state, message)) continue;
      if (state.phase === "snapshot") {
        state.liveDuringSnapshot.push(message);
        if (state.liveDuringSnapshot.length > this.maxOutboundMessages) this.dropSlow(id, state);
        continue;
      }
      this.processLive(id, state, message);
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.all([...this.subscriptions.entries()].map(async ([id, state]) => {
      state.phase = "snapshot";
      state.liveSequence = undefined;
      state.liveDuringSnapshot.length = 0;
      await this.loadSnapshot(id, state);
    }));
  }

  flush(clientId: string): void {
    for (const [id, state] of this.subscriptions) {
      if (state.clientId !== clientId) continue;
      while (state.outbound.length > 0) {
        const message = state.outbound[0];
        if (message === undefined || !state.sink.send(message)) break;
        state.outbound.shift();
      }
      if (state.outbound.length > this.maxOutboundMessages) this.dropSlow(id, state);
    }
  }

  private async loadSnapshot(id: string, state: SubscriptionState): Promise<void> {
    const snapshot = await this.snapshots.read(state.request);
    if (this.subscriptions.get(id) !== state) return;
    state.watermark = snapshot.revisionWatermark;
    this.deliver(id, state, snapshot);
    if (this.subscriptions.get(id) !== state) return;
    state.phase = "live";
    const buffered = state.liveDuringSnapshot.splice(0);
    for (const message of buffered) {
      this.processLive(id, state, message);
    }
  }

  private processLive(id: string, state: SubscriptionState, message: MarketLiveMessage): void {
    if (state.liveSequence !== undefined && message.sequence <= state.liveSequence) return;
    if (state.liveSequence !== undefined && message.sequence > state.liveSequence + 1) {
      state.phase = "snapshot";
      state.liveSequence = undefined;
      state.liveDuringSnapshot.push(message);
      void this.loadSnapshot(id, state);
      return;
    }
    state.liveSequence = message.sequence;
    if (message.candle.closed && message.revisionWatermark <= state.watermark) return;
    state.watermark = Math.max(state.watermark, message.revisionWatermark);
    this.deliver(id, state, message);
  }

  private deliver(id: string, state: SubscriptionState, message: MarketRealtimeMessage): void {
    if (state.outbound.length === 0 && state.sink.send(message)) return;
    state.outbound.push(message);
    if (state.outbound.length > this.maxOutboundMessages) this.dropSlow(id, state);
  }

  private dropSlow(id: string, state: SubscriptionState): void {
    this.disconnect(state.clientId);
    state.sink.disconnect("slow-client");
    this.subscriptions.delete(id);
  }

  private id(clientId: string, subscriptionId: string): string {
    return `${clientId}\u0000${subscriptionId}`;
  }

  private countForClient(clientId: string): number {
    let count = 0;
    for (const state of this.subscriptions.values()) {
      if (state.clientId === clientId) count += 1;
    }
    return count;
  }
}
