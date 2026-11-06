import { relativeTime } from "./relativeTime";

export type ActivityItem = {
  kind: string;
  status: string;
  createdAt: number;
  sentAt?: number;
};

const KIND_NOUN: Record<string, string> = {
  request_notification: "Notification",
  overdue_reminder: "Reminder",
};

const STATUS_VERB: Record<string, string> = {
  queued: "queued",
  sent: "sent",
  failed: "failed",
};

/** "Notification sent 2 minutes ago", "Reminder sent 2 days ago", "Notification failed 1 hour ago". */
export function describeActivity(item: ActivityItem, now: number): string {
  const noun = KIND_NOUN[item.kind] ?? "Automation";
  const verb = STATUS_VERB[item.status] ?? item.status;
  // A sent event is dated by delivery; queued/failed ones by when they were created.
  const at = item.status === "sent" && item.sentAt ? item.sentAt : item.createdAt;
  return `${noun} ${verb} ${relativeTime(at, now)}`;
}
