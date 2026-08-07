import { Module } from "@nestjs/common";
import { InvitationsService } from "./invitations.service.js";
import { InvitationsController } from "./invitations.controller.js";

@Module({ controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
