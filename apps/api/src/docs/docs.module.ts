import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { DocumentService } from "./document.service.js";
import { DocsController } from "./docs.controller.js";

@Module({ imports: [WorkModule], controllers: [DocsController], providers: [DocumentService], exports: [DocumentService] })
export class DocsModule {}
