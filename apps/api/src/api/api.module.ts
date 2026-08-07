import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { ApiTokenService } from "./api-token.service.js";
import { PublicApiService } from "./public-api.service.js";
import { ApiTokenGuard } from "./api-token.guard.js";
import { ScopeGuard } from "./scope.guard.js";
import { IdempotencyInterceptor } from "./idempotency.interceptor.js";
import { ApiTokensController, OpenApiController, PublicApiController } from "./api.controller.js";

@Module({
  imports: [WorkModule],
  controllers: [ApiTokensController, OpenApiController, PublicApiController],
  providers: [ApiTokenService, PublicApiService, ApiTokenGuard, ScopeGuard, IdempotencyInterceptor],
  exports: [ApiTokenService, ApiTokenGuard, ScopeGuard],
})
export class ApiModule {}
