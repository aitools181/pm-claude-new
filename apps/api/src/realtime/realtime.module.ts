import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrgContextModule } from "../org-context/org-context.module.js";

@Global()
@Module({ imports: [AuthModule, OrgContextModule], providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
