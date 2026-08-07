import { WebSocketGateway, WebSocketServer, OnGatewayConnection, SubscribeMessage, MessageBody, ConnectedSocket } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SessionService } from "../auth/session.service.js";
import { OrgContextService } from "../org-context/org-context.service.js";

/**
 * Authenticated realtime. A socket is bound to a user via the session cookie,
 * then joins user + organization rooms. Emits are best-effort; the inbox is the
 * source of truth (deduped), so a reconnect never produces duplicate state.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly sessions: SessionService, private readonly orgCtx: OrgContextService) {}

  async handleConnection(client: Socket) {
    try {
      const raw = parseCookie(client.handshake.headers.cookie ?? "", "pm_session");
      if (!raw) return client.disconnect(true);
      const session = await this.sessions.resolve(raw);
      client.data.userId = session.userId;
      client.join(`user:${session.userId}`);
    } catch { client.disconnect(true); }
  }

  /** Client opts into an organization room only after membership is verified. */
  @SubscribeMessage("join-org")
  async joinOrg(@ConnectedSocket() client: Socket, @MessageBody() body: { organizationId: string }) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false };
    try {
      await this.orgCtx.assertMembership(userId, body.organizationId);
      client.join(`org:${body.organizationId}`);
      return { ok: true };
    } catch { return { ok: false }; }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}

function parseCookie(header: string, name: string): string | null {
  return header.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1] ?? null;
}
