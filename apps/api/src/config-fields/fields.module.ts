import { Module } from "@nestjs/common";
import { FieldsService } from "./fields.service.js";
import { FieldSecurityService } from "./field-security.service.js";
import { FieldsController } from "./fields.controller.js";

@Module({ controllers: [FieldsController], providers: [FieldsService, FieldSecurityService], exports: [FieldsService, FieldSecurityService] })
export class FieldsModule {}
