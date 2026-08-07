"use client";
import { io, type Socket } from "socket.io-client";
import { getCurrentOrg } from "./api";

let socket: Socket | null = null;

/** Connect once; authenticate via cookie; join the current org room. */
export function getSocket(): Socket {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  socket = io(url, { withCredentials: true, transports: ["websocket"] });
  socket.on("connect", () => {
    const org = getCurrentOrg();
    if (org) socket!.emit("join-org", { organizationId: org });
  });
  return socket;
}
