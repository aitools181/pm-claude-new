import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/home", "/settings", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("pm_session");
  if (PROTECTED.some((p) => pathname.startsWith(p)) && !hasSession) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/home/:path*", "/settings/:path*", "/admin/:path*"] };
