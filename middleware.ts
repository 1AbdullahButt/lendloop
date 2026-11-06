import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Convenience only: this redirects signed-out visitors before the page loads.
// It is NOT the security boundary — every Convex function re-checks identity and role.
const isProtectedRoute = createRouteMatcher(["/tools(.*)", "/my(.*)", "/admin(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isProtectedRoute(req)) return;
    const { userId } = await auth();
    if (userId) return;
    // Same-origin sign-in page (not Clerk's hosted portal), with a way back afterwards.
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
