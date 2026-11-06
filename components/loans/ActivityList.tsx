import { describeActivity, type ActivityItem } from "@/lib/activity";

/** Automation history for one loan (AC19), e.g. "Reminder sent 2 days ago". */
export function ActivityList({ items, now }: { items: ActivityItem[]; now: number }) {
  if (items.length === 0) {
    return <p className="text-xs text-stone-500">No automation activity yet.</p>;
  }
  return (
    <ul aria-label="Automation activity" className="space-y-0.5">
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.createdAt}-${item.status}`}
          className={`text-xs ${item.status === "failed" ? "text-red-700" : "text-stone-600"}`}
        >
          {describeActivity(item, now)}
        </li>
      ))}
    </ul>
  );
}
