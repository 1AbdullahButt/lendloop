import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display-wide text-[40px] leading-[1.05] font-black tracking-[-0.02em]">{title}</h1>
      {children ? <p className="text-ink-3">{children}</p> : null}
    </div>
  );
}

/** Page body width: "wide" for grids and tables, "narrow" for reading lists. */
export function PageBody({
  width = "wide",
  gap = "gap-6",
  children,
}: {
  width?: "wide" | "narrow";
  gap?: "gap-6" | "gap-8";
  children: ReactNode;
}) {
  return (
    <div className={`${width === "wide" ? "wrap" : "wrap-narrow"} flex flex-col ${gap} pt-8 pb-16`}>
      {children}
    </div>
  );
}
