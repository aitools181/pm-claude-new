import { Module } from "@nestjs/common";
import { TwoFactorService } from "./twofa.service.js";
import { TwoFactorController } from "./twofa.controller.js";

@Module({
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
