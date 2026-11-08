"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { shortName } from "@/lib/names";
import { Wordmark } from "./ui/Logo";
import { TimeZoneDialog, useTimeZone } from "./TimeZone";
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
  const pathname = usePathname();
  const listRef = useRef<HTMLSpanElement>(null);
  // On a narrow screen the nav scrolls sideways: once the links are drawn, keep the current
  // tab fully in view, clear of the fade at the right edge.
  useEffect(() => {
    const nav = listRef.current?.closest("nav");
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const fade = 32;
    if (active.offsetLeft < nav.scrollLeft) nav.scrollLeft = Math.max(0, active.offsetLeft - 8);
    else if (active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth - fade) {
      nav.scrollLeft = active.offsetLeft + active.offsetWidth - nav.clientWidth + fade;
    }
  }, [pathname, waiting, isAdmin]);
  return (
    <>
      <span ref={listRef} hidden />
      {LINKS.map((link) => (
        <NavLink key={link.href} {...link} badge={link.href === "/my/incoming" ? waiting : undefined} />
      ))}
      {isAdmin ? <NavLink href="/admin" label="Admin" /> : null}
    </>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
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
  const zone = useTimeZone();
  const [zoneOpen, setZoneOpen] = useState(false);
  return (
    <header
      className={onAdminPage ? "on-dark bg-ink text-paper" : "border-b border-line-soft bg-white"}
    >
      <div className="wrap flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <Link
          href="/"
          className={`inline-flex min-h-11 flex-none items-center gap-2.5 no-underline ${onAdminPage ? "text-paper" : "text-ink"}`}
        >
          <Wordmark dark={onAdminPage} />
          {onAdminPage ? (
            <span className="mono rounded bg-sun px-1.5 text-xs font-semibold tracking-[0.08em] text-ink">ADMIN</span>
          ) : null}
        </Link>
        <nav aria-label="Main" className="nav-row scroll-x relative flex min-w-0 flex-1 gap-1 max-[640px]:order-3 max-[640px]:basis-full">
          {ready ? (
            <QueryBoundary fallback={null}>
              <NavLinks />
            </QueryBoundary>
          ) : null}
        </nav>
        <span className="ml-auto inline-flex flex-none items-center gap-2.5">
          {me ? (
            <span className={`text-[15px] ${onAdminPage ? "text-on-night" : ""}`}>
              {onAdminPage ? "Signed in as an admin" : shortName(me.name)}
            </span>
          ) : null}
          {ready ? (
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label={`Time zone · ${zone.replace(/_/g, " ")}`}
                  labelIcon={<GlobeIcon />}
                  onClick={() => setZoneOpen(true)}
                />
              </UserButton.MenuItems>
            </UserButton>
          ) : (
            <UserButton />
          )}
          {ready ? <TimeZoneDialog open={zoneOpen} onClose={() => setZoneOpen(false)} /> : null}
        </span>
      </div>
    </header>
  );
}
