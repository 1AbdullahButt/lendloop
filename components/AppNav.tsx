"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/my/listings", label: "My listings" },
  { href: "/my/requests", label: "My requests" },
  { href: "/my/incoming", label: "Incoming" },
];

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
      }`}
    >
      {label}
    </Link>
  );
}

/** Rendered inside EnsureUser, so `users.me` always has a row to read. */
export function AppNav() {
  const me = useQuery(api.users.me);
  // Cosmetic only: hiding the link is UX; admin.* functions check the role in Convex.
  const isAdmin = me?.role === "admin";
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {LINKS.map((link) => (
        <NavLink key={link.href} {...link} />
      ))}
      {isAdmin ? <NavLink href="/admin" label="Admin" /> : null}
    </nav>
  );
}
