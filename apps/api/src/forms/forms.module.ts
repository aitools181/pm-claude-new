import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { FormsService } from "./forms.service.js";
import { SubmissionsService } from "./submissions.service.js";
import { FormsController } from "./forms.controller.js";
import { PublicFormsController } from "./public-forms.controller.js";
import { RateLimiter, AllowAllCaptcha, CAPTCHA } from "./public-guards.js";

@Module({
  imports: [WorkModule],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService, SubmissionsService, RateLimiter, { provide: CAPTCHA, useClass: AllowAllCaptcha }],
  exports: [FormsService],
})
export class FormsModule {}
