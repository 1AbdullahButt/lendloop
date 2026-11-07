"use client";

import { useMutation, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { Button } from "./ui/Button";
import { InlineError } from "./ui/States";

const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

/** The signed-in user's time zone: every date, "today" and time on the page uses it. */
export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}

/** The browser's own zone, if it names a real IANA zone. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Mounted by EnsureUser once the users row exists. Reads the stored zone live (so a change
 * from the header menu re-renders every date), and on the first sign-in stores the browser's
 * zone as the default. The server validates it either way.
 */
export function TimeZoneProvider({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const setTimeZone = useMutation(api.users.setTimeZone);
  const tried = useRef(false);
  const device = useMemo(deviceTimeZone, []);

  useEffect(() => {
    if (!me || me.timeZone || tried.current || !device) return;
    tried.current = true;
    // Best effort: if it fails, dates fall back to the browser's zone below and the user can
    // still set one from the header menu.
    setTimeZone({ timeZone: device }).catch(() => undefined);
  }, [me, device, setTimeZone]);

  const zone = me?.timeZone ?? device ?? DEFAULT_TIME_ZONE;
  return <TimeZoneContext.Provider value={zone}>{children}</TimeZoneContext.Provider>;
}

function zoneChoices(current: string, device: string | null): string[] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  return Array.from(new Set([current, ...(device ? [device] : []), DEFAULT_TIME_ZONE, ...all])).sort();
}

/** Small modal for the header menu's "Time zone" item. */
export function TimeZoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useTimeZone();
  const device = useMemo(deviceTimeZone, []);
  const choices = useMemo(() => zoneChoices(current, device), [current, device]);
  const [value, setValue] = useState(current);
  const save = useAction(useMutation(api.users.setTimeZone));
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(current);
      save.clearError();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Only opening and closing should reset the form, not every save state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="tz-title"
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-md border border-line-soft bg-white p-0 text-ink shadow-[0_24px_60px_-30px_rgba(21,32,27,0.6)] backdrop:bg-ink/40"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save.run({ timeZone: value })) onClose();
        }}
      >
        <h2 id="tz-title" className="font-display text-xl font-extrabold">
          Time zone
        </h2>
        <p className="text-[15px] text-ink-2">
          Dates, &quot;today&quot; and times show in this zone. It also decides which day counts as today when you ask
          for or approve dates.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tz-select" className="field-label">
            Your time zone
          </label>
          <select id="tz-select" className="field-input" value={value} onChange={(e) => setValue(e.target.value)}>
            {choices.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {device && device !== value ? (
            <button type="button" className="self-start text-sm font-bold underline" onClick={() => setValue(device)}>
              Use this device&apos;s zone ({device.replace(/_/g, " ")})
            </button>
          ) : null}
        </div>
        <InlineError message={save.error} />
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.pending || value === current}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
