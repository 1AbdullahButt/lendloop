"use client";

import { useMutation } from "convex/react";
import { useRef, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { Button } from "../ui/Button";
import { Stamp } from "../ui/Stamp";
import { EmptyState, InlineError } from "../ui/States";
import { AdminSection, AdminTable } from "./AdminTable";

type AdminTool = FunctionReturnType<typeof api.admin.listTools>[number];

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function RemoveControl({ tool, waiting }: { tool: AdminTool; waiting: number }) {
  // The buttons vanish once the listing is removed; focus lands on the result instead.
  const cellRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={cellRef} tabIndex={-1} className="inline-block rounded">
      <RemoveControlBody tool={tool} waiting={waiting} onRemoved={() => cellRef.current?.focus()} />
    </div>
  );
}

function RemoveControlBody({
  tool,
  waiting,
  onRemoved,
}: {
  tool: AdminTool;
  waiting: number;
  onRemoved: () => void;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const [removedHere, setRemovedHere] = useState<number | null>(null);
  const remove = useAction(useMutation(api.admin.removeListing));

  if (tool.removedAt !== undefined) {
    return (
      <span role="status" className="inline-flex flex-wrap items-center justify-end gap-2">
        <Stamp tone="cancelled" size="sm" press={removedHere !== null}>
          Removed
        </Stamp>
        <span className="text-sm text-ink-2">
          {removedHere
            ? `${plural(removedHere, "request", "requests")} canceled, borrowers emailed`
            : "Hidden from the board"}
        </span>
      </span>
    );
  }
  if (!confirming) {
    return (
      <Button variant="danger-ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Remove listing ${tool.name}`}>
        Remove listing
      </Button>
    );
  }
  // Admin removal works even mid-loan (docs/DECISIONS.md); the active loan stays returnable.
  const question =
    tool.status === "on_loan"
      ? "It's out on loan. Remove it anyway? The loan can still be marked returned."
      : waiting > 0
        ? `Remove it and cancel ${plural(waiting, "waiting request", "waiting requests")}?`
        : "Remove it from the board?";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm">{question}</span>
        <Button size="sm" disabled={remove.pending} onClick={() => setConfirming(false)}>
          Keep
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={remove.pending}
          onClick={async () => {
            if (await remove.run({ toolId: tool._id })) {
              setRemovedHere(waiting);
              onRemoved();
            }
          }}
        >
          {remove.pending ? "Removing…" : "Yes, remove"}
        </Button>
      </span>
      <InlineError message={remove.error} />
    </span>
  );
}

export function AdminTools({ tools, waitingByTool }: { tools: AdminTool[]; waitingByTool: Map<string, number> }) {
  return (
    <AdminSection id="listings" title="Listings" note="Removing a listing hides it everywhere and cancels its waiting requests.">
      {tools.length === 0 ? (
        <EmptyState title="No tools listed yet" />
      ) : (
        <AdminTable caption="All listings, including removed ones" minWidth={520} headers={["Tool", "Owner", { label: "Action", right: true }]}>
          {tools.map((tool) => (
            <tr key={tool._id} className={tool.removedAt !== undefined ? "bg-paper" : undefined}>
              <td>
                <span className="font-bold">{tool.name}</span>
                {tool.status === "on_loan" && tool.removedAt === undefined ? (
                  <span className="ml-2 text-sm text-ink-2">on loan</span>
                ) : null}
              </td>
              <td>{shortName(tool.ownerName)}</td>
              <td className="text-right">
                <RemoveControl tool={tool} waiting={waitingByTool.get(tool._id) ?? 0} />
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );
}
