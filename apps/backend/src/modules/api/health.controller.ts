// Health endpoint. The only endpoint this slice adds.
import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  readonly status: "ok";
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
