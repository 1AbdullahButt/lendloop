import type { ReactNode } from "react";

/** One admin section: heading, optional note, then its table. */
export function AdminSection({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="font-display text-[26px] font-extrabold">
          {title}
        </h2>
        {note ? <span className="max-w-[62ch] text-sm text-ink-2">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminTable({
  caption,
  headers,
  minWidth = 720,
  children,
}: {
  caption: string;
  headers: Array<string | { label: string; right?: boolean }>;
  minWidth?: number;
  children: ReactNode;
}) {
  return (
    <div className="tbl">
      <table style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => {
              const { label, right } = typeof h === "string" ? { label: h, right: false } : h;
              return (
                <th key={label || "actions"} scope="col" className={right ? "text-right" : undefined}>
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
