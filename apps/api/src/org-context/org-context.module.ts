import { Global, Module } from "@nestjs/common";
import { OrgContextService } from "./org-context.service.js";
import { OrgContextGuard } from "./org-context.guard.js";
import { OrgContextController } from "./org-context.controller.js";
import { MembersController } from "./members.controller.js";

@Global()
@Module({
  controllers: [OrgContextController, MembersController],
  providers: [OrgContextService, OrgContextGuard],
  exports: [OrgContextService, OrgContextGuard],
})
export class OrgContextModule {}
