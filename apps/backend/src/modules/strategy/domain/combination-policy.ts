import type { Annotation } from "./annotation.js";
import type { StrategyResult } from "./strategy.js";

export interface ComponentResult {
  readonly componentId: string;
  readonly result: StrategyResult;
}

export interface CombinationPolicyDescriptor {
  readonly id: string;
  readonly version: string;
}

export interface CombinationPolicy {
  readonly descriptor: CombinationPolicyDescriptor;
  
  combine(
    componentResults: readonly ComponentResult[],
    config: Record<string, unknown>
  ): StrategyResult;
}

function mergeAnnotations(componentResults: readonly ComponentResult[]): Annotation[] {
  const merged: Annotation[] = [];
  for (const { componentId, result } of componentResults) {
    for (const annotation of result.annotations) {
      merged.push({ ...annotation, componentId });
    }
  }
  return merged;
}

export class MajorityVotePolicy implements CombinationPolicy {
  readonly descriptor = { id: "majority-vote", version: "1.0.0" };

  combine(componentResults: readonly ComponentResult[], config: Record<string, unknown>): StrategyResult {
    let buyCount = 0;
    let sellCount = 0;
    
    let effectiveTime = 0;
    for (const { result } of componentResults) {
      if (result.signal.effectiveTime > effectiveTime) {
        effectiveTime = result.signal.effectiveTime;
      }
      if (result.signal.action === "buy") buyCount++;
      if (result.signal.action === "sell") sellCount++;
    }

    // Tie rule: if buy and sell counts are equal, or neither has a majority over hold, it defaults to hold.
    // Technically, it's a simple plurality. 
    // If buyCount > sellCount && buyCount > holdCount -> buy?
    // Wait, the official example just says BUY = 2, HOLD = 1 -> BUY.
    // Tie rule: if buyCount > sellCount -> buy. if sellCount > buyCount -> sell.
    // If buyCount === sellCount -> hold.
    
    let action: "buy" | "sell" | "hold" = "hold";
    let reason = "Tie or hold majority";

    if (buyCount > sellCount) {
      action = "buy";
      reason = `Majority vote: ${buyCount} buy, ${sellCount} sell`;
    } else if (sellCount > buyCount) {
      action = "sell";
      reason = `Majority vote: ${buyCount} buy, ${sellCount} sell`;
    }

    return {
      signal: { action, effectiveTime, reason },
      annotations: mergeAnnotations(componentResults)
    };
  }
}

export class WeightedScorePolicy implements CombinationPolicy {
  readonly descriptor = { id: "weighted-score", version: "1.0.0" };

  combine(componentResults: readonly ComponentResult[], config: Record<string, unknown>): StrategyResult {
    const weights = config.weights as number[] | undefined;
    const threshold = typeof config.threshold === "number" ? config.threshold : 0.3;

    if (!Array.isArray(weights) || weights.length !== componentResults.length) {
      throw new Error("WEIGHTED_POLICY_CONFIG: weights must be an array of numbers with the same length as components");
    }

    let score = 0;
    let effectiveTime = 0;

    for (let i = 0; i < componentResults.length; i++) {
      const { result } = componentResults[i]!;
      const weight = weights[i]!;
      
      if (result.signal.effectiveTime > effectiveTime) {
        effectiveTime = result.signal.effectiveTime;
      }

      if (result.signal.action === "buy") {
        score += weight * 1;
      } else if (result.signal.action === "sell") {
        score += weight * -1;
      }
    }

    let action: "buy" | "sell" | "hold" = "hold";
    if (score > threshold) {
      action = "buy";
    } else if (score < -threshold) {
      action = "sell";
    }

    return {
      signal: { 
        action, 
        effectiveTime, 
        reason: `Weighted score ${score.toFixed(2)} vs threshold ${threshold.toFixed(2)}` 
      },
      annotations: mergeAnnotations(componentResults)
    };
  }
}
