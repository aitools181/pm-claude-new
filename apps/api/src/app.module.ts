import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { MailModule } from "./mail/mail.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { OpsModule } from "./ops/ops.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { OrgContextModule } from "./org-context/org-context.module.js";
import { AuthzModule } from "./authz/authz.module.js";
import { InvitationsModule } from "./invitations/invitations.module.js";
import { WorkModule } from "./work/work.module.js";
import { CollabModule } from "./collab/collab.module.js";
import { FilesModule } from "./files/files.module.js";
import { ViewsModule } from "./views/views.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { FieldsModule } from "./config-fields/fields.module.js";
import { WorkflowModule } from "./workflow/workflow.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { ConfigExportModule } from "./config-export/config-export.module.js";
import { AutomationModule } from "./automation/automation.module.js";
import { TemplatesModule } from "./templates/templates.module.js";
import { PortabilityModule } from "./portability/portability.module.js";
import { MaintenanceOpsModule } from "./maintenance-ops/maintenance-ops.module.js";
import { PlanningModule } from "./dependencies/planning.module.js";
import { SchedulingModule } from "./scheduling/scheduling.module.js";
import { TimeModule } from "./time/time.module.js";
import { ResourceModule } from "./resource/resource.module.js";
import { FormsModule } from "./forms/forms.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { AgileModule } from "./agile/agile.module.js";
import { GoalsModule } from "./goals/goals.module.js";
import { PortfoliosModule } from "./portfolios/portfolios.module.js";
import { DashboardsModule } from "./dashboards/dashboards.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { DocsModule } from "./docs/docs.module.js";
import { MeetingsModule } from "./meetings/meetings.module.js";
import { ProofingModule } from "./proofing/proofing.module.js";
import { ApiModule } from "./api/api.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { DrModule } from "./dr/dr.module.js";
import { DataOpsModule } from "./data-ops/data-ops.module.js";
import { SecurityModule } from "./security/security.module.js";
import { ReleaseModule } from "./release/release.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { WhiteboardModule } from "./whiteboard/whiteboard.module.js";
import { AiModule } from "./ai/ai.module.js";
import { WqlModule } from "./wql/wql.module.js";
import { EnterpriseIdentityModule } from "./enterprise-identity/enterprise-identity.module.js";
import { CalculationsModule } from "./calculations/calculations.module.js";
import { ScenariosModule } from "./scenarios/scenarios.module.js";
import { MigrationAssistantsModule } from "./migration-assistants/migration-assistants.module.js";
import { DevOpsModule } from "./devops/devops.module.js";
import { ConnectedSearchModule } from "./connected-search/connected-search.module.js";
import { SandboxModule } from "./sandbox/sandbox.module.js";
import { ServiceManagementModule } from "./service-management/service-management.module.js";
import { DiscoveryModule } from "./discovery/discovery.module.js";
import { CommunicationsModule } from "./communications/communications.module.js";
import { ProductivityModule } from "./productivity/productivity.module.js";
import { AiAgentsModule } from "./ai-agents/ai-agents.module.js";
import { UxModule } from "./ux/ux.module.js";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const existing = req.headers["x-request-id"];
          const id = (Array.isArray(existing) ? existing[0] : existing) ?? crypto.randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
    ConfigModule, DbModule, MailModule, AuditModule, OpsModule,
    HealthModule, AuthModule, OrgContextModule, AuthzModule, InvitationsModule, WorkModule, CollabModule, FilesModule, ViewsModule, RealtimeModule, FieldsModule, WorkflowModule, RolesModule, ConfigExportModule, AutomationModule, TemplatesModule, PortabilityModule, MaintenanceOpsModule, PlanningModule, SchedulingModule, TimeModule, ResourceModule, FormsModule, ApprovalsModule, AgileModule, GoalsModule, PortfoliosModule, DashboardsModule, ReportsModule, DocsModule, MeetingsModule, ProofingModule, ApiModule, WebhooksModule, IntegrationsModule, DrModule, DataOpsModule, SecurityModule, ReleaseModule, ChatModule, WhiteboardModule, AiModule, WqlModule, EnterpriseIdentityModule, CalculationsModule, ScenariosModule, MigrationAssistantsModule, DevOpsModule, ConnectedSearchModule, SandboxModule, ServiceManagementModule, DiscoveryModule, CommunicationsModule, ProductivityModule, AiAgentsModule, UxModule,
  ],
})
export class AppModule {}
