"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useCallback, useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { todayIn } from "@/lib/dates";
import { CATEGORIES, categoryLabel, type Category } from "@/lib/labels";
import { myLoanOn } from "@/lib/loanText";
import { useTimeZone } from "../TimeZone";
import { buttonClass } from "../ui/Button";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { BorrowingCard } from "./BorrowingCard";
import { ToolCard, type ToolItem } from "./ToolCard";

type Selection = { id: Id<"tools">; snapshot: ToolItem } | null;

function BrowseBody({
  category,
  query,
  selection,
  onSelect,
  onClearSearch,
}: {
  category: Category | "";
  query: string;
  selection: Selection;
  onSelect: (tool: ToolItem) => void;
  onClearSearch: () => void;
}) {
  const tools = useQuery(api.tools.list, category ? { category } : {});
  // My own loans, so a tag says "With you" or "You asked" instead of the generic status.
  const mine = useQuery(api.loans.listMine);
  const today = todayIn(useTimeZone());
  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  const q = query.trim().toLowerCase();
  const shown = q ? tools.filter((t) => t.name.toLowerCase().includes(q)) : tools;
  return (
    <>
      <p className="-mt-3 text-ink-3" aria-live="polite">
        {shown.length} {shown.length === 1 ? "tool" : "tools"} from your neighbors
      </p>
      {shown.length === 0 ? (
        <EmptyState
          title={
            q
              ? `Nothing matches "${query.trim()}" yet`
              : category
                ? `No ${categoryLabel(category).toLowerCase()} on the board yet`
                : "Nothing on the board yet"
          }
          action={
            <>
              {q ? (
                <button type="button" className={buttonClass("ghost")} onClick={onClearSearch}>
                  Clear search
                </button>
              ) : null}
              <Link href="/my/listings" className={buttonClass("primary")}>
                List a tool
              </Link>
            </>
          }
        >
          Nobody on the board is lending one right now. List something of your own so the board grows.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
          {shown.map((tool) => (
            <li key={tool._id} className="flex">
              <ToolCard
                tool={tool}
                selected={selection?.id === tool._id}
                onPick={() => onSelect(tool)}
                mine={myLoanOn(mine, tool._id)}
                today={today}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Keeps the card's tool fresh from the live list, falling back to the last snapshot. */
function SelectedCard({
  category,
  selection,
  open,
  onClose,
  onDone,
}: {
  category: Category | "";
  selection: Selection;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const tools = useQuery(api.tools.list, category ? { category } : {});
  const live = selection ? tools?.find((t) => t._id === selection.id) : undefined;
  const tool = selection ? (live ?? selection.snapshot) : null;
  return <BorrowingCard tool={tool} open={open} onClose={onClose} onDone={onDone} />;
}

export function ToolsBrowser() {
  const searchId = useId();
  const [category, setCategory] = useState<Category | "">("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display-wide text-[40px] leading-[1.05] font-black tracking-[-0.02em]">Browse tools</h1>
          <label htmlFor={searchId} className="field-label flex min-w-[200px] flex-[0_1_280px] flex-col gap-1">
            Search
            <input
              id={searchId}
              type="search"
              placeholder="Drill, ladder, tent…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field-input"
            />
          </label>
        </div>

        <div role="group" aria-label="Filter by category" className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:flex-wrap md:px-0">
          {(["", ...CATEGORIES] as const).map((c) => (
            <button key={c || "all"} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c ? categoryLabel(c) : "All"}
            </button>
          ))}
        </div>

        {/* Keyed so a failed filter can be retried after switching category. */}
        <QueryBoundary key={category}>
          <BrowseBody
            category={category}
            query={query}
            selection={selection}
            onSelect={(tool) => {
              setSelection({ id: tool._id, snapshot: tool });
              setOpen(true);
            }}
            onClearSearch={() => setQuery("")}
          />
        </QueryBoundary>

        <p className="max-w-[70ch] text-sm text-ink-3">
          Trusted Lender means an admin has vouched for this neighbor. Condition runs New, Good, Fair, Worn. Worn
          shows its age but works.
        </p>
      </div>

      <QueryBoundary key={`card-${category}`}>
        <SelectedCard
          category={category}
          selection={selection}
          open={open}
          onClose={close}
          onDone={() => {
            setSelection(null);
            setOpen(false);
          }}
        />
      </QueryBoundary>
    </div>
  );
}
