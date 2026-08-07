import { Module } from "@nestjs/common";
import { ProofingService } from "./proofing.service.js";
import { PortalService } from "./portal.service.js";
import { ProofingController, PortalPublicController } from "./proofing.controller.js";

@Module({ controllers: [ProofingController, PortalPublicController], providers: [ProofingService, PortalService], exports: [ProofingService, PortalService] })
export class ProofingModule {}
