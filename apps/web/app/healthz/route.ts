import { NextResponse } from "next/server";

/**
 * Container health probe. Deliberately at /healthz, not /api/health, because
 * next.config rewrites /api/:path* to the API service.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "web", time: new Date().toISOString() });
}
