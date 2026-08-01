import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseHost, isSchoolConsolePath, ROOT_DOMAIN } from "@/lib/tenantHost";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const parsed = parseHost(host);
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-host-kind", parsed.kind);
  requestHeaders.set("x-tenant-slug", parsed.slug ?? "");
  requestHeaders.set("x-request-host", parsed.hostname);

  // School subdomain: marketing landing lives on apex only — root goes to the console
  // (AuthProvider sends authenticated school admins from /login to /dashboard)
  if (parsed.kind === "tenant" && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // School subdomain: platform Schools console stays on apex
  if (parsed.kind === "tenant" && (pathname === "/schools" || pathname.startsWith("/schools/"))) {
    const url = request.nextUrl.clone();
    url.hostname = `www.${ROOT_DOMAIN}`;
    url.port = "";
    url.protocol = "https:";
    url.pathname = "/schools";
    return NextResponse.redirect(url);
  }

  // Apex/www: school ops consoles are not hosted here — send users to login
  // (AuthProvider then redirects school_admin to their subdomain; platform to /schools)
  if (
    (parsed.kind === "apex" || parsed.kind === "local") &&
    isSchoolConsolePath(pathname)
  ) {
    // Allow local dev without subdomain DNS: only enforce hard block on real apex hosts
    if (parsed.kind === "apex") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "use-school-subdomain");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
