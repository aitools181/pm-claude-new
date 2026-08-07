import { Global, Module } from "@nestjs/common";
import { PlansService } from "./plans.service.js";
import { PricingController, BillingController, PlanAdminController } from "./plans.controller.js";

@Global()
@Module({ controllers: [PricingController, BillingController, PlanAdminController], providers: [PlansService], exports: [PlansService] })
export class PlansModule {}
