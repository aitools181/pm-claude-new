"use client";
import { io, type Socket } from "socket.io-client";
import { getCurrentOrg } from "./api";

let socket: Socket | null = null;

/** Connect once; authenticate via the HttpOnly session cookie; join current org. */
export function getSocket(): Socket {
  if (socket) return socket;
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  // Empty URL intentionally means same-origin, matching REST and the Next proxy.
  const url = configured || undefined;
  socket = io(url, {
    path: "/socket.io",
    withCredentials: true,
    // Keep polling enabled as a safe fallback when an ingress cannot upgrade WS.
    transports: ["polling", "websocket"],
    reconnection: true,
  });
  socket.on("connect", () => {
    const org = getCurrentOrg();
    if (org) socket!.emit("join-org", { organizationId: org });
  });
  return socket;
}

/** Used after logout/account switching so stale authenticated sockets are closed. */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
