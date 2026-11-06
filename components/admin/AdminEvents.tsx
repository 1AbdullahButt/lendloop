"use client";

import { useQuery } from "convex/react";
import { useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import { relativeTime } from "@/lib/relativeTime";
import { useNow } from "@/lib/useNow";
import { StatusBadge } from "../ui/Badges";
import { EmptyState, LoadingState } from "../ui/States";
import { AdminTable, Cell } from "./AdminTable";

const KIND_LABELS: Record<string, string> = {
  request_notification: "Notification",
  overdue_reminder: "Overdue reminder",
};

function EventRows({ failedOnly }: { failedOnly: boolean }) {
  const events = useQuery(api.admin.listAutomationEvents, failedOnly ? { status: "failed" } : {});
  const now = useNow();
  if (events === undefined) return <LoadingState label="Loading automation events…" />;
  if (events.length === 0) {
    return <EmptyState title={failedOnly ? "No failed deliveries" : "No automation events yet"} />;
  }
  return (
    <AdminTable caption="Automation events, newest first" headers={["Kind", "Key", "Status", "Attempts", "Created", "Last error"]}>
      {events.map((event) => {
        const failed = event.status === "failed";
        return (
          <tr key={event._id} className={failed ? "bg-red-50" : undefined}>
            <Cell>{KIND_LABELS[event.kind] ?? event.kind}</Cell>
            <Cell className="font-mono text-xs text-stone-600">{event.idempotencyKey}</Cell>
            <Cell>
              <StatusBadge status={event.status} />
            </Cell>
            <Cell>{event.attempts}</Cell>
            <Cell className="whitespace-nowrap">{relativeTime(event.createdAt, now)}</Cell>
            <Cell className={failed ? "text-red-800" : "text-stone-600"}>{event.lastError ?? "—"}</Cell>
          </tr>
        );
      })}
    </AdminTable>
  );
}

/** Outbound + reminder log. Failed rows are highlighted with their lastError (AC17). */
export function AdminEvents() {
  const id = useId();
  const [failedOnly, setFailedOnly] = useState(false);
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={failedOnly}
          onChange={(e) => setFailedOnly(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor={id}>Show failed only</label>
      </div>
      <EventRows failedOnly={failedOnly} />
    </>
  );
}
