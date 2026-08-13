import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "../ops/health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  liveness() { return { status: "ok", service: "api", time: new Date().toISOString() }; }

  @Get("ready")
  async readiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.readiness();
    if (result.status !== "ready") res.status(503);
    return result;
  }
}
