import { Body, Controller, Inject, Post } from "@nestjs/common";
import type { CreateSpecificationRequest, CreateSpecificationResponse } from "@crypto-strategy-lab/api-contracts";
import { ExperimentSpecificationService } from "../experiment/index.js";


@Controller("specifications")
export class SpecificationController {
  constructor(
    @Inject(ExperimentSpecificationService) private readonly specs: ExperimentSpecificationService
  ) {}

  @Post()
  async create(@Body() body: CreateSpecificationRequest): Promise<CreateSpecificationResponse> {
    const draft = await this.specs.createDraft(body);
    const frozen = await this.specs.freeze(draft.specId, {
      engine: { id: "ui", version: "1.0.0" },
      nodeRuntimeVersion: process.version.replace("v", ""),
      dependencyLockHash: "0".repeat(64),
      applicationCommit: "unknown",
      workerCommit: "unknown",
      deterministicConfigVersion: "1.0.0"
    });
    return { specId: frozen.specId };
  }
}
