"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/labels";
import { useAction } from "@/lib/useAction";
import { PersonName, StatusBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { EmptyState, InlineError, LoadingState } from "../ui/States";
import { AdminTable, Cell } from "./AdminTable";

type AdminTool = FunctionReturnType<typeof api.admin.listTools>[number];

function RemoveListingButton({ tool }: { tool: AdminTool }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(useMutation(api.admin.removeListing));
  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)} aria-label={`Remove listing ${tool.name}`}>
        Remove listing
      </Button>
    );
  }
  return (
    <div>
      <div className="flex gap-2">
        <Button variant="danger" disabled={remove.pending} onClick={() => void remove.run({ toolId: tool._id })}>
          {remove.pending ? "Removing…" : "Confirm remove"}
        </Button>
        <Button disabled={remove.pending} onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </div>
      <InlineError message={remove.error} />
    </div>
  );
}

export function AdminTools() {
  const tools = useQuery(api.admin.listTools);
  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  if (tools.length === 0) return <EmptyState title="No tools listed yet" />;
  return (
    <AdminTable caption="All tools, including removed ones" headers={["Tool", "Category", "Lender", "Status", ""]}>
      {tools.map((tool) => (
        <tr key={tool._id} className={tool.removedAt ? "bg-stone-50 text-stone-500" : undefined}>
          <Cell>{tool.name}</Cell>
          <Cell>{categoryLabel(tool.category)}</Cell>
          <Cell>
            <PersonName name={tool.ownerName} trusted={tool.ownerTrusted} />
          </Cell>
          <Cell>
            <StatusBadge status={tool.removedAt ? "removed" : tool.status} />
          </Cell>
          <Cell className="text-right">{tool.removedAt ? null : <RemoveListingButton tool={tool} />}</Cell>
        </tr>
      ))}
    </AdminTable>
  );
}
