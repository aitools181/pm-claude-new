import { NextResponse, type NextRequest } from "next/server";

// Every route rendered inside app/(app) must require the server-issued HttpOnly
// session cookie. Public token/auth/help entry points remain outside this list.
const PROTECTED = [
  "/admin", "/ai", "/approvals", "/calculations", "/calendar", "/chat",
  "/communications", "/connected-search", "/dashboards", "/devops", "/discovery",
  "/docs", "/goals", "/help", "/home", "/inbox", "/meetings", "/migration",
  "/mobility", "/my-tasks", "/portfolios", "/productivity", "/projects", "/proofing",
  "/quick", "/reports", "/scenarios", "/search", "/service", "/settings",
  "/superadmin", "/time", "/whiteboard", "/workload",
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needsSession = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !req.cookies.has("pm_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Static literal required by Next's middleware matcher analysis.
export const config = {
  matcher: [
    "/admin/:path*", "/ai/:path*", "/approvals/:path*", "/calculations/:path*", "/calendar/:path*", "/chat/:path*",
    "/communications/:path*", "/connected-search/:path*", "/dashboards/:path*", "/devops/:path*", "/discovery/:path*",
    "/docs/:path*", "/goals/:path*", "/help/:path*", "/home/:path*", "/inbox/:path*", "/meetings/:path*", "/migration/:path*",
    "/mobility/:path*", "/my-tasks/:path*", "/portfolios/:path*", "/productivity/:path*", "/projects/:path*", "/proofing/:path*",
    "/quick/:path*", "/reports/:path*", "/scenarios/:path*", "/search/:path*", "/service/:path*", "/settings/:path*",
    "/superadmin/:path*", "/time/:path*", "/whiteboard/:path*", "/workload/:path*",
  ],
};
