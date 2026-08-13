import { Global, Module } from "@nestjs/common";
import { BackgroundJobsService } from "./background-jobs.service.js";

@Global()
@Module({ providers: [BackgroundJobsService], exports: [BackgroundJobsService] })
export class BackgroundJobsModule {}
