// Experiment-owned use case for draft editing, validation, and atomic freezing.

import { randomUUID } from "node:crypto";
import type { DatasetService } from "../../market/index.js";
import {
  compositeExecutionDescriptor,
  CompositeStrategyService,
  StrategyRegistry
} from "../../strategy/index.js";
import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type {
  DraftExperimentSpecification,
  ExperimentDraftContent,
  ExperimentSpecification,
  FreezeProvenance,
  FrozenExperimentContent,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import { assertSentimentInputConfiguration } from "../domain/sentiment-input.js";

export interface ExperimentSpecificationStore {
  create(specId: string, content: ExperimentDraftContent): Promise<DraftExperimentSpecification>;
  updateDraft(specId: string, content: ExperimentDraftContent): Promise<DraftExperimentSpecification>;
  freeze(
    specId: string,
    content: FrozenExperimentContent,
    contentHash: string
  ): Promise<FrozenExperimentSpecification>;
  find(specId: string): Promise<ExperimentSpecification | undefined>;
}

function assertVersion(field: string, value: string): void {
  if (value === "latest" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`EXPERIMENT_VERSION: ${field} must be an explicit semantic version`);
  }
}

function requireField(value: unknown, field: string): void {
  if (value === undefined || value === null || value === "") {
    throw new Error(`EXPERIMENT_FIELD_REQUIRED: ${field}`);
  }
}

function assertDraft(content: ExperimentDraftContent): void {
  requireField(content.schemaVersion, "schemaVersion");
  requireField(content.datasetRef, "datasetRef");
  requireField(content.strategy, "strategy");
  requireField(content.execution, "execution");
  requireField(content.metricSet, "metricSet");
  const dataset = content.datasetRef;
  const strategy = content.strategy;
  const execution = content.execution;
  const metricSet = content.metricSet;
  requireField(dataset.range, "datasetRef.range");
  requireField(execution.stopLoss, "execution.stopLoss");
  requireField(execution.takeProfit, "execution.takeProfit");
  for (const [field, value] of [
    ["datasetRef.datasetId", dataset.datasetId],
    ["datasetRef.version", dataset.version],
    ["datasetRef.manifestVersion", dataset.manifestVersion],
    ["datasetRef.provider", dataset.provider],
    ["datasetRef.symbols", dataset.symbols],
    ["datasetRef.timeframe", dataset.timeframe],
    ["datasetRef.range.startTime", dataset.range.startTime],
    ["datasetRef.range.endTime", dataset.range.endTime],
    ["datasetRef.revisionWatermark", dataset.revisionWatermark],
    ["datasetRef.integrityHash", dataset.integrityHash],
    ["strategy.id", strategy.id],
    ["strategy.version", strategy.version],
    ["strategy.parameters", strategy.parameters],
    ["execution.initialCapital", execution.initialCapital],
    ["execution.feeRate", execution.feeRate],
    ["execution.slippageRate", execution.slippageRate],
    ["execution.signalTiming", execution.signalTiming],
    ["execution.fillRule", execution.fillRule],
    ["execution.maxConcurrentPositions", execution.maxConcurrentPositions],
    ["execution.leverage", execution.leverage],
    ["execution.positionSizing", execution.positionSizing],
    ["execution.allowedDirections", execution.allowedDirections],
    ["execution.stopLoss", execution.stopLoss],
    ["execution.stopLoss.enabled", execution.stopLoss.enabled],
    ["execution.takeProfit", execution.takeProfit],
    ["execution.takeProfit.enabled", execution.takeProfit.enabled],
    ["execution.sameBarExitPriority", execution.sameBarExitPriority],
    ["execution.finalPositionPolicy", execution.finalPositionPolicy],
    ["execution.decimalPlaces", execution.decimalPlaces],
    ["metricSet.id", metricSet.id],
    ["metricSet.version", metricSet.version]
  ] as const) {
    requireField(value, field);
  }
  if (content.schemaVersion !== "v1") {
    throw new Error("EXPERIMENT_SCHEMA_VERSION: schemaVersion must be v1");
  }
  if (dataset.manifestVersion !== "v1") {
    throw new Error("EXPERIMENT_DATASET: datasetRef.manifestVersion must be v1");
  }
  assertVersion("strategy.version", strategy.version);
  assertVersion("metricSet.version", metricSet.version);
  if (!Number.isInteger(dataset.version) || dataset.version < 1) {
    throw new Error("EXPERIMENT_DATASET: datasetRef.version must be a positive integer");
  }
  if (
    !Array.isArray(dataset.symbols) ||
    dataset.symbols.length === 0 ||
    dataset.symbols.some((symbol) => typeof symbol !== "string" || symbol.trim() === "")
  ) {
    throw new Error("EXPERIMENT_FIELD_REQUIRED: datasetRef.symbols");
  }
  if (
    !Number.isSafeInteger(dataset.range.startTime) ||
    !Number.isSafeInteger(dataset.range.endTime) ||
    dataset.range.endTime < dataset.range.startTime
  ) {
    throw new Error("EXPERIMENT_DATASET: datasetRef.range must be an ordered integer range");
  }
  if (!Number.isSafeInteger(dataset.revisionWatermark) || dataset.revisionWatermark < 0) {
    throw new Error("EXPERIMENT_DATASET: datasetRef.revisionWatermark must be non-negative");
  }
  if (!Number.isFinite(execution.initialCapital) || execution.initialCapital <= 0) {
    throw new Error("EXPERIMENT_EXECUTION: execution.initialCapital must be positive");
  }
  for (const field of ["feeRate", "slippageRate"] as const) {
    const value = execution[field];
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`EXPERIMENT_EXECUTION: execution.${field} must be at least zero and less than one`);
    }
  }
  if (
    execution.signalTiming !== "close-of-bar" ||
    execution.fillRule !== "next-open" ||
    execution.maxConcurrentPositions !== 1 ||
    execution.leverage !== 1 ||
    execution.positionSizing !== "available-equity" ||
    execution.sameBarExitPriority !== "stop-loss-first" ||
    execution.finalPositionPolicy !== "liquidate-at-final-close" ||
    execution.decimalPlaces !== 8
  ) {
    throw new Error("EXPERIMENT_EXECUTION: execution configuration is outside the accepted V1 profile");
  }
  for (const [field, rule] of [["stopLoss", execution.stopLoss], ["takeProfit", execution.takeProfit]] as const) {
    if (rule.enabled && (!Number.isFinite(rule.percentage) || rule.percentage <= 0 || rule.percentage >= 1)) {
      throw new Error(`EXPERIMENT_EXECUTION: execution.${field}.percentage must be greater than zero and less than one`);
    }
  }
  if (
    !Array.isArray(execution.allowedDirections) ||
    execution.allowedDirections.length !== 2 ||
    !execution.allowedDirections.includes("long") ||
    !execution.allowedDirections.includes("short")
  ) {
    throw new Error("EXPERIMENT_EXECUTION: execution.allowedDirections must contain long and short");
  }
}

function assertProvenance(provenance: FreezeProvenance): void {
  requireField(provenance.engine, "provenance.engine");
  for (const [field, value] of [
    ["provenance.engine.id", provenance.engine.id],
    ["provenance.engine.version", provenance.engine.version],
    ["provenance.nodeRuntimeVersion", provenance.nodeRuntimeVersion],
    ["provenance.dependencyLockHash", provenance.dependencyLockHash],
    ["provenance.applicationCommit", provenance.applicationCommit],
    ["provenance.workerCommit", provenance.workerCommit],
    ["provenance.deterministicConfigVersion", provenance.deterministicConfigVersion]
  ] as const) {
    requireField(value, field);
  }
  assertVersion("provenance.engine.version", provenance.engine.version);
  assertVersion("provenance.deterministicConfigVersion", provenance.deterministicConfigVersion);
  assertVersion("provenance.nodeRuntimeVersion", provenance.nodeRuntimeVersion);
  if (!/^[0-9a-f]{64}$/.test(provenance.dependencyLockHash)) {
    throw new Error("EXPERIMENT_PROVENANCE: dependencyLockHash must be a SHA-256 hash");
  }
  for (const field of ["applicationCommit", "workerCommit"] as const) {
    const value = provenance[field];
    if (value.trim() === "" || value === "latest") {
      throw new Error(`EXPERIMENT_PROVENANCE: ${field} must be explicit`);
    }
  }
}

export class ExperimentSpecificationService {
  constructor(
    private readonly store: ExperimentSpecificationStore,
    private readonly datasets: DatasetService,
    private readonly strategies: StrategyRegistry,
    private readonly composites?: CompositeStrategyService
  ) {}

  createDraft(content: ExperimentDraftContent): Promise<DraftExperimentSpecification> {
    return this.store.create(randomUUID(), content);
  }

  updateDraft(
    specId: string,
    content: ExperimentDraftContent
  ): Promise<DraftExperimentSpecification> {
    return this.store.updateDraft(specId, content);
  }

  async freeze(
    specId: string,
    provenance: FreezeProvenance
  ): Promise<FrozenExperimentSpecification> {
    const current = await this.get(specId);
    if (current.status === "frozen") {
      throw new Error(`EXPERIMENT_FROZEN: specification ${specId} is already frozen`);
    }
    assertDraft(current.content);
    assertProvenance(provenance);
    await this.datasets.resolveDataset(current.content.datasetRef);
    let requiredInputs: readonly string[];
    try {
      const runnable = this.strategies.resolve(current.content.strategy);
      runnable.validateParameters(current.content.strategy.parameters);
      requiredInputs = runnable.descriptor.requiredInputs;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("STRATEGY_NOT_FOUND:") ||
        this.composites === undefined
      ) {
        throw error;
      }
      if (Object.keys(current.content.strategy.parameters).length !== 0) {
        throw new Error("STRATEGY_PARAMETER_UNKNOWN: composite strategies accept no run-time parameters");
      }
      const composite = await this.composites.resolve(
        current.content.strategy.id,
        current.content.strategy.version
      );
      requiredInputs = compositeExecutionDescriptor(
        composite.descriptor,
        composite.definition.components.map((reference) => this.strategies.resolve(reference).descriptor)
      ).requiredInputs;
    }
    if (requiredInputs.includes("sentiment-series")) {
      if (current.content.sentimentInput === undefined) {
        throw new Error("EXPERIMENT_FIELD_REQUIRED: sentimentInput");
      }
      assertSentimentInputConfiguration(current.content.sentimentInput);
      // NEWS-06 names this parameter in the registered descriptor. Parameter
      // validation above already proves its schema; freezing also ties the
      // feature window to that selected descriptor rather than accepting two
      // independent windows in the immutable input.
      const declaredWindow = current.content.strategy.parameters.windowDurationMs;
      if (typeof declaredWindow === "number" &&
        declaredWindow !== current.content.sentimentInput.windowDurationMs) {
        throw new Error("EXPERIMENT_SENTIMENT_WINDOW_MISMATCH: strategy and sentiment input windows differ");
      }
    } else if (current.content.sentimentInput !== undefined) {
      throw new Error("EXPERIMENT_FIELD_FORBIDDEN: sentimentInput");
    }
    const content: FrozenExperimentContent = { ...current.content, provenance };
    return this.store.freeze(specId, content, canonicalSha256(content));
  }

  async get(specId: string): Promise<ExperimentSpecification> {
    const specification = await this.store.find(specId);
    if (specification === undefined) {
      throw new Error(`EXPERIMENT_NOT_FOUND: ${specId}`);
    }
    return specification;
  }
}
