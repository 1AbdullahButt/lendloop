"use client";

import { useId, useState, type FormEvent } from "react";
import {
  CATEGORIES,
  CONDITIONS,
  categoryLabel,
  conditionLabel,
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  type Category,
  type Condition,
} from "@/lib/labels";
import { Button } from "../ui/Button";
import { InlineError } from "../ui/States";

export type ToolFormValues = {
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

const EMPTY: ToolFormValues = { name: "", category: "hand_tools", condition: "good", description: "" };

const fieldClass = "mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm";

type Props = {
  initial?: ToolFormValues;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  /** Resolve true on success; the form resets itself when creating. */
  onSubmit: (values: ToolFormValues) => Promise<boolean>;
  onCancel?: () => void;
};

/** Length limits here are hints for the user; convex/lib/validation.ts is the real check. */
export function ToolForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const id = useId();
  const [values, setValues] = useState<ToolFormValues>(initial ?? EMPTY);
  const set = <K extends keyof ToolFormValues>(key: K, value: ToolFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await onSubmit(values);
    if (ok && !initial) setValues(EMPTY);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input
          id={`${id}-name`}
          required
          maxLength={TOOL_NAME_MAX}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-describedby={`${id}-name-hint`}
          className={fieldClass}
        />
        <p id={`${id}-name-hint`} className="mt-1 text-xs text-stone-500">
          1–{TOOL_NAME_MAX} characters.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-category`} className="text-sm font-medium">
            Category
          </label>
          <select
            id={`${id}-category`}
            value={values.category}
            onChange={(e) => set("category", e.target.value as Category)}
            className={fieldClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-condition`} className="text-sm font-medium">
            Condition
          </label>
          <select
            id={`${id}-condition`}
            value={values.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
            className={fieldClass}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {conditionLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          Description <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={TOOL_DESCRIPTION_MAX}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          aria-describedby={`${id}-description-hint`}
          className={fieldClass}
        />
        <p id={`${id}-description-hint`} className="mt-1 text-xs text-stone-500">
          {values.description.length}/{TOOL_DESCRIPTION_MAX} characters.
        </p>
      </div>
      <InlineError message={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
