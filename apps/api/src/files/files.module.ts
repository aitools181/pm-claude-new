import { Module } from "@nestjs/common";
import { FilesService } from "./files.service.js";
import { StorageGateway } from "./storage.gateway.js";
import { FilesController } from "./files.controller.js";

@Module({ controllers: [FilesController], providers: [FilesService, StorageGateway], exports: [FilesService, StorageGateway] })
export class FilesModule {}
