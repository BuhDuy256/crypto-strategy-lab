// Typed V1 experiment configuration and immutable frozen specification shapes.

import type { DatasetRef } from "../../market/index.js";
import type { StrategyParameters, StrategyRef } from "../../strategy/index.js";
import type { SearchConfiguration } from "./search-specification.js";
import type { SentimentInputConfiguration } from "./sentiment-input.js";

export interface VersionedRef {
  readonly id: string;
  readonly version: string;
}

export interface StrategyConfiguration extends StrategyRef {
  readonly parameters: StrategyParameters;
}

export interface DisabledExitRule {
  readonly enabled: false;
}

export interface EnabledExitRule {
  readonly enabled: true;
  readonly percentage: number;
}

export type ExitRule = DisabledExitRule | EnabledExitRule;

export interface ExecutionModelConfiguration {
  readonly initialCapital: number;
  readonly feeRate: number;
  readonly slippageRate: number;
  readonly signalTiming: "close-of-bar";
  readonly fillRule: "next-open";
  readonly maxConcurrentPositions: 1;
  readonly leverage: 1;
  readonly positionSizing: "available-equity";
  readonly allowedDirections: readonly ("long" | "short")[];
  readonly stopLoss: ExitRule;
  readonly takeProfit: ExitRule;
  readonly sameBarExitPriority: "stop-loss-first";
  readonly finalPositionPolicy: "liquidate-at-final-close";
  readonly decimalPlaces: 8;
}

export interface ExperimentDraftContent {
  readonly schemaVersion: "v1";
  readonly datasetRef: DatasetRef;
  readonly strategy: StrategyConfiguration;
  readonly execution: ExecutionModelConfiguration;
  readonly metricSet: VersionedRef;
  /** Required exactly when the selected descriptor requires `sentiment-series`. */
  readonly sentimentInput?: SentimentInputConfiguration;
  // Present only for a search experiment. When present, `strategy` is a valid
  // template that each generated candidate replaces in its derived specification.
  readonly search?: SearchConfiguration;
}

export interface FreezeProvenance {
  readonly engine: VersionedRef;
  readonly nodeRuntimeVersion: string;
  readonly dependencyLockHash: string;
  readonly applicationCommit: string;
  readonly workerCommit: string;
  readonly deterministicConfigVersion: string;
}

export interface FrozenExperimentContent extends ExperimentDraftContent {
  readonly provenance: FreezeProvenance;
}

interface ExperimentSpecificationBase {
  readonly specId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DraftExperimentSpecification extends ExperimentSpecificationBase {
  readonly status: "draft";
  readonly content: ExperimentDraftContent;
}

export interface FrozenExperimentSpecification extends ExperimentSpecificationBase {
  readonly status: "frozen";
  readonly content: FrozenExperimentContent;
  readonly contentHash: string;
  readonly frozenAt: string;
}

export type ExperimentSpecification = DraftExperimentSpecification | FrozenExperimentSpecification;
