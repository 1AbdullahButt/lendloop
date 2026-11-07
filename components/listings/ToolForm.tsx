"use client";

import { useId, useState, type FormEvent } from "react";
import {
  CATEGORIES,
  categoryLabel,
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

const EMPTY: ToolFormValues = { name: "", category: "power_tools", condition: "good", description: "" };

const CONDITION_OPTIONS: Array<{ value: Condition; label: string; hint: string }> = [
  { value: "new", label: "New", hint: "Barely used" },
  { value: "good", label: "Good", hint: "Normal wear" },
  { value: "fair", label: "Fair", hint: "Scuffed, works fine" },
  { value: "worn", label: "Worn", hint: "Shows its age, works" },
];

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
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof ToolFormValues>(key: K, value: ToolFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const nameMissing = values.name.trim().length === 0;
  const nameBad = touched && nameMissing;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (nameMissing) {
      setTouched(true);
      return;
    }
    const ok = await onSubmit(values);
    if (ok && !initial) {
      setValues(EMPTY);
      setTouched(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4.5" aria-label={initial ? `Edit ${initial.name}` : "List a tool"}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="field-label">
          Name
        </label>
        <input
          id={`${id}-name`}
          required
          maxLength={TOOL_NAME_MAX}
          value={values.name}
          placeholder="e.g. Leaf blower"
          onChange={(e) => {
            set("name", e.target.value);
            setTouched(true);
          }}
          aria-invalid={nameBad}
          aria-describedby={`${id}-name-help`}
          className="field-input"
        />
        <span id={`${id}-name-help`} className={`flex justify-between gap-2 text-[13px] ${nameBad ? "text-brick" : "text-ink-2"}`}>
          <span>{nameBad ? "Give it a name so neighbors can find it." : "What neighbors will search for."}</span>
          <span className="mono">
            {values.name.length}/{TOOL_NAME_MAX}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-category`} className="field-label">
          Category
        </label>
        <select
          id={`${id}-category`}
          value={values.category}
          onChange={(e) => set("category", e.target.value as Category)}
          className="field-input"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-1.5">Condition</legend>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_OPTIONS.map((c) => (
            <label key={c.value} className="opt">
              <input
                type="radio"
                name={`${id}-condition`}
                value={c.value}
                checked={values.condition === c.value}
                onChange={() => set("condition", c.value)}
              />
              <span className="font-bold">{c.label}</span>
              <span className="text-[13px] text-ink-2">{c.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-description`} className="field-label">
          Description <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          maxLength={TOOL_DESCRIPTION_MAX}
          value={values.description}
          placeholder="What it comes with, anything to know before using it."
          onChange={(e) => set("description", e.target.value)}
          aria-describedby={`${id}-description-count`}
          className="field-input"
        />
        <span id={`${id}-description-count`} className="mono text-right text-[13px] text-ink-2">
          {values.description.length}/{TOOL_DESCRIPTION_MAX}
        </span>
      </div>

      <InlineError message={error} />
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={pending || nameMissing}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button size="lg" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
