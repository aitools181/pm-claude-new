import { Module } from "@nestjs/common";
import { WorkModule } from "../work/work.module.js";
import { MeetingService } from "./meeting.service.js";
import { MeetingsController } from "./meetings.controller.js";

@Module({ imports: [WorkModule], controllers: [MeetingsController], providers: [MeetingService], exports: [MeetingService] })
export class MeetingsModule {}
