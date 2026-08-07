import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { ApiModule } from "../api/api.module.js";
import { EnterpriseIdentityController } from "./enterprise-identity.controller.js";
import { EnterpriseIdentityService } from "./enterprise-identity.service.js";
import { EnterpriseIdentityPublicController, ScimController } from "./enterprise-identity-public.controller.js";

@Module({ imports: [ApiModule], controllers: [EnterpriseIdentityController, EnterpriseIdentityPublicController, ScimController], providers: [EnterpriseIdentityService, ModulesService], exports: [EnterpriseIdentityService] })
export class EnterpriseIdentityModule {}
