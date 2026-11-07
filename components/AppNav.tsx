"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { shortName } from "@/lib/names";
import { Wordmark } from "./ui/Logo";
import { QueryBoundary } from "./ui/QueryBoundary";

const LINKS = [
  { href: "/tools", label: "Browse" },
  { href: "/my/listings", label: "My listings" },
  { href: "/my/requests", label: "My requests" },
  { href: "/my/incoming", label: "Incoming" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  const pathname = usePathname();
  return (
    <Link href={href} className="navlink" aria-current={isActive(pathname, href) ? "page" : undefined}>
      {label}
      {badge ? (
        <span className="mono rounded-full bg-sun px-2 text-xs font-semibold text-ink">
          {badge}
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </Link>
  );
}

/** Rendered only after EnsureUser, so `users.me` always has a row to read. */
function NavLinks() {
  const me = useQuery(api.users.me);
  const incoming = useQuery(api.loans.listIncoming);
  const waiting = incoming?.filter((l) => l.status === "pending").length ?? 0;
  // Cosmetic only: hiding the link is UX; admin.* functions check the role in Convex.
  const isAdmin = me?.role === "admin";
  return (
    <>
      {LINKS.map((link) => (
        <NavLink key={link.href} {...link} badge={link.href === "/my/incoming" ? waiting : undefined} />
      ))}
      {isAdmin ? <NavLink href="/admin" label="Admin" /> : null}
    </>
  );
}

/**
 * Signed-in header. Before `users.ensure` finishes it shows only the logo and the Clerk
 * button, so no query runs for a user whose row doesn't exist yet.
 */
export function AppHeader({ ready }: { ready: boolean }) {
  const pathname = usePathname();
  // Skipped until the users row exists. The admin look is cosmetic: a plain user who opens
  // /admin gets the normal header (and the page's "Admins only" state from Convex).
  const me = useQuery(api.users.me, ready ? {} : "skip");
  const onAdminPage = isActive(pathname, "/admin") && me?.role === "admin";
  return (
    <header
      className={onAdminPage ? "on-dark bg-ink text-paper" : "border-b border-line-soft bg-white"}
    >
      <div className="wrap flex items-center gap-4 py-2">
        <Link
          href="/"
          className={`inline-flex min-h-11 flex-none items-center gap-2.5 no-underline ${onAdminPage ? "text-paper" : "text-ink"}`}
        >
          <Wordmark dark={onAdminPage} />
          {onAdminPage ? (
            <span className="mono rounded bg-sun px-1.5 text-xs font-semibold tracking-[0.08em] text-ink">ADMIN</span>
          ) : null}
        </Link>
        <nav aria-label="Main" className="scroll-x flex min-w-0 flex-1 gap-1">
          {ready ? (
            <QueryBoundary fallback={null}>
              <NavLinks />
            </QueryBoundary>
          ) : null}
        </nav>
        <span className="inline-flex flex-none items-center gap-2.5">
          {me ? (
            <span className={`hidden text-[15px] sm:inline ${onAdminPage ? "text-on-night" : ""}`}>
              {onAdminPage ? "Signed in as an admin" : shortName(me.name)}
            </span>
          ) : null}
          <UserButton />
        </span>
      </div>
    </header>
  );
}
