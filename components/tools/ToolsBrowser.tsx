"use client";

import { useQuery } from "convex/react";
import { useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, categoryLabel, type Category } from "@/lib/labels";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { ToolCard } from "./ToolCard";

function ToolGrid({ category }: { category: Category | "" }) {
  const tools = useQuery(api.tools.list, category ? { category } : {});
  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  if (tools.length === 0) {
    return (
      <EmptyState title={category ? `No ${categoryLabel(category).toLowerCase()} listed yet` : "No tools listed yet"}>
        Be the first: add one in My listings.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {tools.map((tool) => (
        <li key={tool._id}>
          <ToolCard tool={tool} />
        </li>
      ))}
    </ul>
  );
}

export function ToolsBrowser() {
  const filterId = useId();
  const [category, setCategory] = useState<Category | "">("");
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor={filterId} className="text-sm font-medium">
          Category
        </label>
        <select
          id={filterId}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </div>
      {/* Keyed so a failed filter can be retried after switching category. */}
      <QueryBoundary key={category}>
        <ToolGrid category={category} />
      </QueryBoundary>
    </>
  );
}
