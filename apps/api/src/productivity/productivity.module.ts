import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { ProductivityController } from "./productivity.controller.js";
import { ProductivityService } from "./productivity.service.js";
@Module({ imports: [WorkModule], controllers: [ProductivityController], providers: [ProductivityService, ModulesService], exports: [ProductivityService] })
export class ProductivityModule {}
