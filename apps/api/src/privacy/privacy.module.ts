import { Global, Module } from "@nestjs/common";
import { PrivacyService } from "./privacy.service.js";
import { PrivacyController } from "./privacy.controller.js";

@Global()
@Module({ controllers: [PrivacyController], providers: [PrivacyService], exports: [PrivacyService] })
export class PrivacyModule {}
