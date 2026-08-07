import { Module } from "@nestjs/common";
import { ViewsService } from "./views.service.js";
import { ViewsController } from "./views.controller.js";
@Module({ controllers: [ViewsController], providers: [ViewsService] })
export class ViewsModule {}
