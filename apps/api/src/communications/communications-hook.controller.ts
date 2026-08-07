import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { CommunicationsService } from "./communications.service.js";
const hookDto = z.object({ payload: z.string().min(2) });
@Controller("hooks/email")
export class CommunicationsHookController {
  constructor(private readonly service: CommunicationsService) {}
  @Post(":integrationId") receive(@Param("integrationId") integrationId: string, @Headers("x-pm-signature") signature: string, @Body(new ZodPipe(hookDto)) body: z.infer<typeof hookDto>) {
    return this.service.receiveSignedEmail(integrationId, signature ?? "", body.payload);
  }
}
