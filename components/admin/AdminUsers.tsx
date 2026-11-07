"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { TrustedBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { EmptyState, InlineError } from "../ui/States";
import { AdminSection, AdminTable } from "./AdminTable";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

/**
 * "b***@example.com · #3f9k2a": the masked email helps an admin recognize someone, and the
 * id suffix tells two "Ben C." at the same provider (or two with no email) apart. Six id
 * characters are not guaranteed unique, but a clash between two given rows is around 1 in
 * 100,000. No full address is printed on screen.
 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "no email";
  return `${email.charAt(0)}***${email.slice(at)}`;
}

function accountHint(user: AdminUser): string {
  return `${maskEmail(user.email)} · #${user._id.slice(-6)}`;
}

function TrustedToggle({ user }: { user: AdminUser }) {
  const setTrusted = useAction(useMutation(api.admin.setTrustedLender));
  const name = shortName(user.name);
  const who = `${name} (${accountHint(user)})`;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center justify-end gap-2.5">
        {user.trustedLender ? <TrustedBadge compact /> : null}
        <Button
          size="sm"
          disabled={setTrusted.pending}
          onClick={() => void setTrusted.run({ userId: user._id, trusted: !user.trustedLender })}
        >
          {user.trustedLender ? "Remove badge" : "Mark trusted"}
          <span className="sr-only"> for {who}</span>
        </Button>
      </span>
      <InlineError message={setTrusted.error} />
    </span>
  );
}

/** Names, badges and a masked email plus id suffix only: full addresses stay out of the admin screen (data minimization). */
export function AdminUsers({ users, toolCounts }: { users: AdminUser[]; toolCounts: Map<string, number> }) {
  return (
    <AdminSection id="neighbors" title="Neighbors" note="Trusted Lender is a badge on the person, shown next to all their tools.">
      {users.length === 0 ? (
        <EmptyState title="No neighbors yet" />
      ) : (
        <AdminTable caption="Neighbors" minWidth={440} headers={["Name", "Tools", { label: "Trusted Lender", right: true }]}>
          {users.map((user) => (
            <tr key={user._id} data-role={user.role}>
              <td>
                <span className="inline-flex flex-wrap items-center gap-2 font-bold">
                  {shortName(user.name)}
                  {/* Read-only: roles change only via ADMIN_EMAILS or the users.setRole dashboard mutation. */}
                  {user.role === "admin" ? <span className="stamp stamp-sm s-cancelled">Admin</span> : null}
                </span>
                <span className="mono block text-xs text-ink-3">{accountHint(user)}</span>
              </td>
              <td className="num">{toolCounts.get(user._id) ?? 0}</td>
              <td className="text-right">
                <TrustedToggle user={user} />
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );
}
