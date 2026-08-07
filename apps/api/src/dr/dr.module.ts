import { Module } from "@nestjs/common";
import { DrService } from "./dr.service.js";
import { DrController } from "./dr.controller.js";

@Module({ controllers: [DrController], providers: [DrService], exports: [DrService] })
export class DrModule {}
