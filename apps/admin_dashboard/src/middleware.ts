import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseHost } from "@/lib/tenantHost";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const parsed = parseHost(host);
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-host-kind", parsed.kind);
  requestHeaders.set("x-tenant-slug", parsed.slug ?? "");
  requestHeaders.set("x-request-host", parsed.hostname);

  // School subdomain: platform-only console stays on apex
  if (parsed.kind === "tenant" && pathname.startsWith("/schools")) {
    const url = request.nextUrl.clone();
    url.hostname = "onthebusapp.com";
    url.port = "";
    url.protocol = "https:";
    url.pathname = "/schools";
    return NextResponse.redirect(url);
  }

  // Apex marketing site: keep /dashboard behind login on apex only for platform;
  // school operators should use their subdomain (enforced in AuthProvider/login).

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
