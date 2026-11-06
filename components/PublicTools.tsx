"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/labels";
import { QueryBoundary } from "./ui/QueryBoundary";
import { EmptyState, LoadingState } from "./ui/States";

// Guest view: renders only name + category from the projected tools.listPublic (SPEC 5, AC1/AC2).
function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);
  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  if (tools.length === 0) {
    return (
      <EmptyState testId="public-tools-empty" title="No tools available right now">
        Sign in to list the first one.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tools.map((tool) => (
        <li
          key={tool._id}
          data-testid="public-tool-item"
          className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
        >
          <p data-testid="public-tool-name" className="font-medium">
            {tool.name}
          </p>
          <p data-testid="public-tool-category" className="text-sm text-stone-500">
            {categoryLabel(tool.category)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function PublicTools() {
  return (
    <div data-testid="public-tools">
      <QueryBoundary>
        <PublicToolList />
      </QueryBoundary>
    </div>
  );
}
