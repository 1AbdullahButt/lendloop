"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { AdminEvents } from "./AdminEvents";
import { AdminLoans } from "./AdminLoans";
import { AdminSection } from "./AdminTable";
import { AdminTools } from "./AdminTools";
import { AdminUsers } from "./AdminUsers";

function AdminsOnly() {
  return <EmptyState title="Admins only">This page is for LendLoop admins. Ask an admin if you need access.</EmptyState>;
}

const SECTIONS = [
  { title: "Automation events", Body: AdminEvents },
  { title: "All loans", Body: AdminLoans },
  { title: "All tools", Body: AdminTools },
  { title: "Users", Body: AdminUsers },
];

export function AdminDashboard() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <LoadingState />;
  // Skip the admin queries for plain users; if this check is stale, Convex answers FORBIDDEN
  // and each section's boundary shows the same friendly state.
  if (me.role !== "admin") return <AdminsOnly />;
  return (
    <>
      {SECTIONS.map(({ title, Body }) => (
        <AdminSection key={title} title={title}>
          <QueryBoundary forbidden={<AdminsOnly />}>
            <Body />
          </QueryBoundary>
        </AdminSection>
      ))}
    </>
  );
}
