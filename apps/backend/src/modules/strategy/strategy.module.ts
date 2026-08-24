import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { StrategyRegistry } from "./application/strategy-registry.js";
import { createBuiltInStrategyRegistry } from "./application/built-in-strategy-registry.js";
import { CombinationPolicyRegistry } from "./application/combination-policy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./application/built-in-combination-policy-registry.js";
import { CompositeStrategyService } from "./application/composite-strategy.service.js";
import { PostgresCompositeRepository } from "./infrastructure/postgres-composite-repository.js";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import type { Pool } from "pg";

const STRATEGY_DATABASE_POOL = Symbol("STRATEGY_DATABASE_POOL");

class StrategyDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(STRATEGY_DATABASE_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: STRATEGY_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: StrategyRegistry,
      useFactory: createBuiltInStrategyRegistry
    },
    {
      provide: CombinationPolicyRegistry,
      useFactory: createBuiltInCombinationPolicyRegistry
    },
    {
      provide: PostgresCompositeRepository,
      useFactory: (pool: Pool) => new PostgresCompositeRepository(pool),
      inject: [STRATEGY_DATABASE_POOL]
    },
    {
      provide: CompositeStrategyService,
      useFactory: (repo: PostgresCompositeRepository, stratReg: StrategyRegistry, polReg: CombinationPolicyRegistry) => new CompositeStrategyService(repo, stratReg, polReg),
      inject: [PostgresCompositeRepository, StrategyRegistry, CombinationPolicyRegistry]
    },
    StrategyDatabaseLifecycle
  ],
  exports: [StrategyRegistry, CombinationPolicyRegistry, CompositeStrategyService]
})
export class StrategyModule {}
