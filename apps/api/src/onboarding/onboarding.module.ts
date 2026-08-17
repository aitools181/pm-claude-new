import { Module } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service.js";
import { OnboardingController } from "./onboarding.controller.js";

@Module({ controllers: [OnboardingController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}
