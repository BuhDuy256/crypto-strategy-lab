// ExperimentModule backs ARC-EXPERIMENT (Experiment).
//
// Owns immutable experiment specifications, run state/control/stop
// policy, candidate/job lifecycle, dispatch reconciliation,
// deterministic backtest simulation, metric evaluation, ranking
// policy, trades/results, result commit/outbox, leaderboard
// projection, and experiment/provenance queries (see
// architecture-baseline.md). Empty in this slice: composition
// boundary only, no business logic yet.
import { Module } from "@nestjs/common";

@Module({})
export class ExperimentModule {}
