import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { PublicTools } from "@/components/PublicTools";

const ctaClass =
  "inline-flex items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">LendLoop</h1>
        <p className="mt-2 text-lg text-stone-600">Borrow what you need. Lend what you don&apos;t.</p>
        <div className="mt-6">
          <Show
            when="signed-in"
            fallback={
              <Link href="/sign-in" className={ctaClass}>
                Sign in to lend or borrow
              </Link>
            }
          >
            <Link href="/tools" className={ctaClass}>
              Browse all tools
            </Link>
          </Show>
        </div>
      </header>

      <section aria-labelledby="public-tools-heading">
        <h2 id="public-tools-heading" className="mb-3 text-lg font-semibold">
          Available now
        </h2>
        <PublicTools />
      </section>
    </main>
  );
}
