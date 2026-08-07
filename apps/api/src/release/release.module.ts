import { Module } from "@nestjs/common";
import { ReleaseService } from "./release.service.js";
import { ReleaseController, ReleasePublicController } from "./release.controller.js";

@Module({ controllers: [ReleasePublicController, ReleaseController], providers: [ReleaseService], exports: [ReleaseService] })
export class ReleaseModule {}
