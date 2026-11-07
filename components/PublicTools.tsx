"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/labels";
import { QueryBoundary } from "./ui/QueryBoundary";
import { EmptyState, LoadingState } from "./ui/States";

// The board's tags cycle through four looks and small tilts, like notes pinned to a board.
const LOOKS = [
  { bg: "#FFFFFF", fg: "#15201B", sub: "#4F5B55" },
  { bg: "#F5C518", fg: "#15201B", sub: "#3B3000" },
  { bg: "#FFFFFF", fg: "#15201B", sub: "#4F5B55" },
  { bg: "#1F6B4E", fg: "#FFFFFF", sub: "#D6EDE2" },
];
const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

// Guest view: renders only name + category from the projected tools.listPublic (SPEC 5, AC1/AC2).
function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);
  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  if (tools.length === 0) {
    return (
      <EmptyState testId="public-tools-empty" title="Nothing on the board right now">
        Sign in to list the first tool on your block.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-wrap gap-4">
      {tools.map((tool, i) => {
        const look = LOOKS[i % LOOKS.length];
        return (
          <li
            key={tool._id}
            data-testid="public-tool-item"
            className="relative min-w-[200px] rounded-[12px_12px_12px_34px] border-2 border-ink py-4 pr-5.5 pl-10.5"
            style={{ background: look.bg, color: look.fg, rotate: `${TILTS[i % TILTS.length]}deg` }}
          >
            <span className="tag-hole top-5" aria-hidden="true" />
            <p
              data-testid="public-tool-category"
              className="mono text-xs font-semibold tracking-[0.06em] uppercase"
              style={{ color: look.sub }}
            >
              {categoryLabel(tool.category)}
            </p>
            <p
              data-testid="public-tool-name"
              className="mt-1 font-display text-[21px] leading-[1.2] font-extrabold"
              style={{ fontStretch: "108%" }}
            >
              {tool.name}
            </p>
          </li>
        );
      })}
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
