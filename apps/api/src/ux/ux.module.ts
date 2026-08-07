import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { UxController } from "./ux.controller.js";
import { UxService } from "./ux.service.js";

@Module({ imports: [WorkModule], controllers: [UxController], providers: [UxService], exports: [UxService] })
export class UxModule {}
