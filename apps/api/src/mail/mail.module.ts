import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service.js";
import { MailSettingsService } from "./mail-settings.service.js";
import { MailSettingsController } from "./mail.controller.js";

@Global()
@Module({ controllers: [MailSettingsController], providers: [MailService, MailSettingsService], exports: [MailService, MailSettingsService] })
export class MailModule {}
