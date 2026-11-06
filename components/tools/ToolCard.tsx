"use client";

import Link from "next/link";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel } from "@/lib/labels";
import { PersonName, StatusBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { Card } from "../ui/PageHeader";
import { RequestForm } from "./RequestForm";

export type ToolItem = FunctionReturnType<typeof api.tools.list>[number];

export function ToolCard({ tool }: { tool: ToolItem }) {
  const [requesting, setRequesting] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{tool.name}</h2>
          <p className="text-sm text-stone-500">
            {categoryLabel(tool.category)} · Condition: {conditionLabel(tool.condition)}
          </p>
        </div>
        <StatusBadge status={tool.status} />
      </div>
      {tool.description ? <p className="mt-2 text-sm text-stone-700">{tool.description}</p> : null}
      <p className="mt-2 text-sm text-stone-600">
        Lent by <PersonName name={tool.ownerName} trusted={tool.ownerTrusted} />
      </p>

      {sent ? (
        <p role="status" className="mt-3 text-sm text-emerald-800">
          Request sent. Track it in{" "}
          <Link href="/my/requests" className="font-medium underline">
            My requests
          </Link>
          .
        </p>
      ) : null}

      {requesting ? (
        <RequestForm
          toolId={tool._id}
          toolName={tool.name}
          onCancel={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            setSent(true);
          }}
        />
      ) : (
        <div className="mt-3">
          {/* Cosmetic: convex/loans.ts rejects requests on your own tool (R1) anyway. */}
          <Button
            variant="primary"
            disabled={tool.isMine}
            onClick={() => {
              setSent(false);
              setRequesting(true);
            }}
            aria-label={`Request ${tool.name}`}
          >
            Request
          </Button>
          {tool.isMine ? <span className="ml-2 text-xs text-stone-500">This is your tool</span> : null}
        </div>
      )}
    </Card>
  );
}
