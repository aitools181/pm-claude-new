import { Module } from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service.js";
import { ProjectsService } from "./projects.service.js";
import { WorkItemMobilityService } from "./work-item-mobility.service.js";
import { MobilityController } from "./mobility.controller.js";
import { WorkItemsService } from "./work-items.service.js";
import { BoardService } from "./board.service.js";
import { PlacementsService } from "./placements.service.js";
import { WorkController } from "./work.controller.js";
import { BoardController } from "./board.controller.js";
import { IdempotencyInterceptor } from "../api/idempotency.interceptor.js";
import { WorkItemDetailsService } from "./work-item-details.service.js";
import { AutoAssignService } from "./auto-assign.service.js";

@Module({
  controllers: [MobilityController, WorkController, BoardController],
  providers: [WorkspacesService, ProjectsService, WorkItemsService, WorkItemDetailsService, WorkItemMobilityService, BoardService, PlacementsService, IdempotencyInterceptor, AutoAssignService],
  exports: [WorkItemMobilityService, ProjectsService, WorkItemsService, WorkItemDetailsService, BoardService, PlacementsService, AutoAssignService],
})
export class WorkModule {}
