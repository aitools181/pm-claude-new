import { Module } from "@nestjs/common";
import { ResourceService } from "./resource.service.js";
import { ResourceController } from "./resource.controller.js";

@Module({ controllers: [ResourceController], providers: [ResourceService], exports: [ResourceService] })
export class ResourceModule {}
