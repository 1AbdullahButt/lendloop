"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { TrustedBadge } from "../ui/Badges";

export type ToolItem = FunctionReturnType<typeof api.tools.list>[number];

export function toolAvailability(tool: ToolItem): { label: string; color: string } {
  if (tool.isMine) return { label: "Your tool", color: "#2E4257" };
  if (tool.status === "available") return { label: "Available now", color: "#145233" };
  return { label: "Out on loan", color: "#6B4E00" };
}

/** One luggage tag in the Browse grid; pressing it opens the borrowing card. */
export function ToolCard({ tool, selected, onPick }: { tool: ToolItem; selected: boolean; onPick: () => void }) {
  const status = toolAvailability(tool);
  return (
    <button type="button" className="tag-card flex min-h-[164px] flex-col gap-2" aria-pressed={selected} onClick={onPick}>
      <span className="tag-hole" aria-hidden="true" />
      <span className="eyebrow">{categoryLabel(tool.category)}</span>
      <span
        className="font-display text-[21px] leading-[1.15] font-extrabold [overflow-wrap:anywhere]"
        style={{ fontStretch: "108%" }}
      >
        {tool.name}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
        <span>{shortName(tool.ownerName)}</span>
        {tool.ownerTrusted ? <TrustedBadge /> : null}
        <span aria-hidden="true">·</span>
        <span>{conditionLabel(tool.condition)}</span>
      </span>
      <span className="mono mt-auto flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: status.color }}>
        <span className="h-2 w-2 rounded-full" style={{ background: status.color }} aria-hidden="true" />
        {status.label}
      </span>
    </button>
  );
}
