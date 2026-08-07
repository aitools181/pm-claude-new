import { Module } from "@nestjs/common";
import { CommentsService } from "./comments.service.js";
import { WatchersService } from "./watchers.service.js";
import { NotificationsService } from "./notifications.service.js";
import { CollabController } from "./collab.controller.js";

@Module({
  controllers: [CollabController],
  providers: [CommentsService, WatchersService, NotificationsService],
  exports: [NotificationsService],
})
export class CollabModule {}
