import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: send visitors without a session cookie to /login.
// The Express API verifies the JWT on every request, so this is UX, not security.
const PUBLIC_PREFIXES = ["/login", "/i/", "/api", "/_next", "/brand", "/favicon"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has("oh_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
