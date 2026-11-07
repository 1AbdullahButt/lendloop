import { Stamp, type StampTone } from "../ui/Stamp";

// Illustration only, labeled "Example": item names are deliberately not ones the seed puts
// on the board, so guests can't read it as anyone's real loan.
const ROWS: Array<{ item: string; out: string; due: string; stamp: string; tone: StampTone; tilt: number }> = [
  { item: "Circular saw", out: "Nov 8", due: "Nov 10", stamp: "Asked", tone: "pending", tilt: -3 },
  { item: "Wheelbarrow", out: "Nov 6", due: "Nov 12", stamp: "Approved", tone: "approved", tilt: 2 },
  { item: "Camp stove", out: "Oct 20", due: "Oct 23", stamp: "Returned", tone: "returned", tilt: -2 },
];

const ledger =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,.7fr)_minmax(0,.7fr)_minmax(0,1fr)] items-center gap-x-3 max-[520px]:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)]";

export function HeroCard() {
  return (
    <figure className="flex min-w-0 flex-[1_1_460px] flex-col gap-3.5">
      <div className="overflow-hidden rounded-md border-2 border-ink bg-white shadow-[0_18px_40px_-24px_rgba(21,32,27,0.45)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 bg-pine px-5 py-3.5 text-white">
          <span className="font-display text-xl font-extrabold tracking-[0.02em]" style={{ fontStretch: "115%" }}>
            BORROWING CARD
          </span>
          <span className="mono rounded bg-sun px-1.5 text-xs font-semibold tracking-[0.08em] text-ink">EXAMPLE</span>
        </div>
        <div
          className="px-5 pt-1.5 pb-4.5"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, transparent 0, transparent 51px, #C9D7E6 51px, #C9D7E6 52px)",
          }}
        >
          <div className={`${ledger} mono h-10 border-b-2 border-rule-red text-xs font-semibold tracking-[0.08em] text-ink-3`}>
            <span>ITEM</span>
            <span className="max-[520px]:hidden">OUT</span>
            <span>DUE</span>
            <span>STATUS</span>
          </div>
          {ROWS.map((row, i) => (
            <div key={row.item} className={`${ledger} h-[52px]`}>
              <span className="truncate font-display text-lg font-bold">{row.item}</span>
              <span className="mono text-sm max-[520px]:hidden">{row.out}</span>
              <span className="mono text-sm">{row.due}</span>
              <span>
                {/* Pressed in one after another on first paint: the card being filled in. */}
                <Stamp tone={row.tone} tilt={row.tilt} press delayMs={250 + i * 140}>
                  {row.stamp}
                </Stamp>
              </span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="max-w-[52ch] text-[15px] text-ink-3">
        Every loan gets a card like this, so the person lending and the person borrowing both see what&apos;s out,
        when it&apos;s due, and what happens next.
      </figcaption>
    </figure>
  );
}
