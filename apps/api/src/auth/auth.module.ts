import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import { SetupService } from "./setup.service.js";
import { TokenService } from "./token.service.js";
import { TwoFactorModule } from "../twofa/twofa.module.js";
import { MailModule } from "../mail/mail.module.js";

@Global()
@Module({
  imports: [TwoFactorModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SetupService, TokenService],
  exports: [SessionService, TokenService],
})
export class AuthModule {}
