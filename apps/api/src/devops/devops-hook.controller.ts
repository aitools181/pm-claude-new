import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { DevOpsService } from "./devops.service.js";
const hookDto = z.object({ payload: z.string().min(2) });
@Controller("hooks/devops")
export class DevOpsHookController {
  constructor(private readonly service: DevOpsService) {}
  @Post(":integrationId") receive(@Param("integrationId") integrationId: string, @Headers("x-pm-signature") signature: string, @Body(new ZodPipe(hookDto)) body: z.infer<typeof hookDto>) {
    return this.service.ingestFromHook(integrationId, signature ?? "", body.payload);
  }
}
