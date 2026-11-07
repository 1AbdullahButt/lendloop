import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { PublicTools } from "@/components/PublicTools";
import { HeroCard } from "@/components/home/HeroCard";
import { Wordmark } from "@/components/ui/Logo";
import { Stamp, type StampTone } from "@/components/ui/Stamp";
import { buttonClass } from "@/components/ui/Button";

const TAGLINE = "Borrow what you need. Lend what you don't.";

const STEPS: Array<{ stamp: string; tone: StampTone; title: string; body: string }> = [
  { stamp: "Ask", tone: "pending", title: "Pick your dates", body: "Start today or later, for up to 30 days. The owner gets an email right away." },
  { stamp: "Answer", tone: "approved", title: "Get a yes or a no", body: "You hear back by email either way. Nobody else can book those dates once it's a yes." },
  { stamp: "Collect", tone: "approved", title: "Pick it up from the owner", body: "Meet up and hand it over. LendLoop keeps track of the dates." },
  { stamp: "Return", tone: "returned", title: "Bring it back on time", body: "Running late? You get one friendly reminder each morning, never two." },
];

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const textLink =
  "inline-flex min-h-11 items-center rounded-lg px-3 text-base text-ink no-underline hover:bg-mist hover:text-ink";

export default function HomePage() {
  return (
    <div className="text-[17px] leading-[1.55]">
      <header className="wrap-home flex flex-wrap items-center justify-between gap-3 py-4">
        <Link href="/" className="inline-flex min-h-11 items-center text-ink no-underline">
          <Wordmark size="lg" />
        </Link>
        <nav aria-label="Home" className="flex flex-wrap items-center gap-1">
          <a className={textLink} href="#how">
            How it works
          </a>
          <a className={textLink} href="#board">
            On the board
          </a>
          <Show
            when="signed-in"
            fallback={
              <Link href="/sign-in" className={buttonClass("primary")}>
                Sign in
              </Link>
            }
          >
            <Link href="/tools" className={buttonClass("primary")}>
              Browse tools
            </Link>
          </Show>
        </nav>
      </header>

      <main>
        <section className="wrap-home flex flex-wrap items-center gap-14 pt-12 pb-20">
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
            {/* The visible headline is the tagline; the name leads the heading for screen readers and the AC1 check. */}
            <h1
              className="font-display text-[clamp(44px,6vw,80px)] leading-[0.98] font-black tracking-[-0.025em] text-balance"
              style={{ fontStretch: "118%" }}
            >
              <span className="sr-only">LendLoop: </span>
              <span>{TAGLINE}</span>
            </h1>
            <p className="max-w-[36ch] text-xl text-pretty text-ink-2">
              A lending board for the tools on your block. Ask for dates, get a clear yes or no, and always
              know when it&apos;s due back.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Show
                when="signed-in"
                fallback={
                  <Link href="/sign-in" className={buttonClass("primary", "lg")}>
                    Sign in to lend or borrow
                    <Arrow />
                  </Link>
                }
              >
                <Link href="/tools" className={buttonClass("primary", "lg")}>
                  Browse all tools
                  <Arrow />
                </Link>
              </Show>
              <a href="#board" className="inline-flex min-h-11 items-center font-bold text-ink">
                See what&apos;s on the board
              </a>
            </div>
          </div>
          <HeroCard />
        </section>

        <section id="how" aria-labelledby="how-heading" className="border-y border-line-soft bg-white">
          <div className="wrap-home flex flex-col gap-9 py-16">
            <h2 id="how-heading" className="font-display-wide text-[40px] leading-[1.05] font-black tracking-[-0.02em]">
              How a loan works
            </h2>
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-7">
              {STEPS.map((step) => (
                <li key={step.stamp} className="flex flex-col gap-2">
                  <Stamp tone={step.tone} className="self-start">
                    {step.stamp}
                  </Stamp>
                  <h3 className="font-display text-[21px] font-extrabold text-balance">{step.title}</h3>
                  <p className="text-base text-pretty text-ink-2">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="board" aria-labelledby="public-tools-heading" className="wrap-home flex flex-col gap-7 pt-16 pb-18">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h2
              id="public-tools-heading"
              className="font-display-wide text-[40px] leading-[1.05] font-black tracking-[-0.02em]"
            >
              On the board right now
            </h2>
            <p className="flex items-center gap-2 text-[15px] text-ink-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Sign in to see who&apos;s lending and request dates.
            </p>
          </div>
          <PublicTools />
        </section>

        <section className="bg-ink text-paper">
          <div className="wrap-home grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-10 py-14">
            <div className="flex flex-col gap-2.5">
              <h2 className="font-display text-[26px] font-extrabold">If you lend</h2>
              <p className="max-w-[46ch] text-pretty text-on-night">
                You approve every request yourself. LendLoop refuses dates that overlap a loan you&apos;ve already
                said yes to, and you can&apos;t delete a tool while someone has it.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <h2 className="font-display text-[26px] font-extrabold">If you borrow</h2>
              <p className="max-w-[46ch] text-pretty text-on-night">
                Signed-in neighbors see your name, never your email. Nobody on this public page can see who owns
                what.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap-home flex flex-wrap justify-between gap-3 pt-6 pb-7 text-sm text-ink-3">
        <span>LendLoop, a tool-lending board for neighbors</span>
        <span>The borrowing card above is an example, not a real loan.</span>
      </footer>
    </div>
  );
}
