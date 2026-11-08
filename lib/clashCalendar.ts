import { addDays, daysBetween } from "./dates";

type Req = { _id: string; status: string; startDate: string; endDate: string };

export type CalendarDay = {
  iso: string;
  /** Day of the month, shown in every cell. */
  day: number;
  /** "Nov", only on the first cell and where the month changes. */
  month: string | null;
  /** What the cell shows: "Nov 9" where the month is shown, else "10". */
  label: string;
  today: boolean;
};

export type CalendarRow<T> = {
  req: T;
  /** First and last cell (inclusive) the request covers. */
  from: number;
  to: number;
  /** Per cell: this request and another one both hold that day. */
  clash: boolean[];
};

export type ClashCalendar<T> = { days: CalendarDay[]; rows: CalendarRow<T>[] };

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const overlap = (a: Req, b: Req) => a.startDate <= b.endDate && b.startDate <= a.endDate;

/**
 * A mini calendar for one tool, only when its waiting and approved requests clash: two or more
 * of them overlap and at least one of each overlapping pair is still waiting. It covers just
 * those requests (earliest start to latest end) plus one day each side, so a few days of
 * clash are never lost in a two-week strip. Returns null when nothing clashes.
 */
export function clashCalendar<T extends Req>(requests: readonly T[], today: string): ClashCalendar<T> | null {
  const active = requests.filter((r) => r.status === "pending" || r.status === "approved");
  const members = active.filter((a) =>
    active.some((b) => b._id !== a._id && overlap(a, b) && (a.status === "pending" || b.status === "pending")),
  );
  if (members.length < 2) return null;

  const first = addDays([...members.map((m) => m.startDate)].sort()[0], -1);
  const last = addDays([...members.map((m) => m.endDate)].sort().slice(-1)[0], 1);
  const count = daysBetween(first, last) + 1;
  const days: CalendarDay[] = [];
  for (let i = 0; i < count; i++) {
    const iso = addDays(first, i);
    const day = Number(iso.slice(8, 10));
    const month = i === 0 || day === 1 ? MONTH.format(Date.parse(`${iso}T00:00:00Z`)) : null;
    days.push({ iso, day, month, label: month ? `${month} ${day}` : String(day), today: iso === today });
  }

  const holds = (r: Req, iso: string) => r.startDate <= iso && iso <= r.endDate;
  const rows = [...members]
    .sort((a, b) => (a.status === b.status ? a.startDate.localeCompare(b.startDate) : a.status === "approved" ? -1 : 1))
    .map((req) => ({
      req,
      from: daysBetween(first, req.startDate),
      to: daysBetween(first, req.endDate),
      clash: days.map((d) => holds(req, d.iso) && members.some((o) => o._id !== req._id && holds(o, d.iso))),
    }));
  return { days, rows };
}
