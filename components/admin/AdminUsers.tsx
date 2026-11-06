"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useAction } from "@/lib/useAction";
import { EmptyState, InlineError, LoadingState } from "../ui/States";
import { AdminTable, Cell } from "./AdminTable";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

function TrustedToggle({ user }: { user: AdminUser }) {
  const setTrusted = useAction(useMutation(api.admin.setTrustedLender));
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={user.trustedLender}
          disabled={setTrusted.pending}
          onChange={(e) => void setTrusted.run({ userId: user._id, trusted: e.target.checked })}
          className="h-4 w-4 accent-violet-700"
        />
        <span>Trusted Lender</span>
        <span className="sr-only">for {user.name}</span>
      </label>
      <InlineError message={setTrusted.error} />
    </div>
  );
}

export function AdminUsers() {
  const users = useQuery(api.admin.listUsers);
  if (users === undefined) return <LoadingState label="Loading users…" />;
  if (users.length === 0) return <EmptyState title="No users yet" />;
  return (
    <AdminTable caption="Users" headers={["Name", "Email", "Role", "Badge"]}>
      {users.map((user) => (
        <tr key={user._id}>
          <Cell>{user.name}</Cell>
          <Cell className="text-stone-600">{user.email}</Cell>
          {/* Read-only: roles change only via ADMIN_EMAILS or the users.setRole dashboard mutation. */}
          <Cell className="capitalize">{user.role}</Cell>
          <Cell>
            <TrustedToggle user={user} />
          </Cell>
        </tr>
      ))}
    </AdminTable>
  );
}
