import { Controller, Get, HttpCode } from "@nestjs/common";
import { HealthService } from "../ops/health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  liveness() { return { status: "ok", service: "api", time: new Date().toISOString() }; }

  @Get("ready")
  async readiness() { return this.health.readiness(); }
}
