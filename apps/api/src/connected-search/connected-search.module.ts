import { Module } from "@nestjs/common";
import { ModulesService } from "../modules/modules.service.js";
import { ConnectedSearchController } from "./connected-search.controller.js";
import { ConnectedSearchService } from "./connected-search.service.js";
@Module({ controllers: [ConnectedSearchController], providers: [ConnectedSearchService, ModulesService], exports: [ConnectedSearchService] })
export class ConnectedSearchModule {}
