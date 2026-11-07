import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 py-6 text-ink-3">
      <span
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-pine motion-reduce:animate-none"
      />
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  children,
  action,
  testId,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-start gap-2.5 rounded-2xl border-2 border-dashed border-line px-6 py-9"
    >
      <h3 className="font-display text-[21px] font-extrabold">{title}</h3>
      {children ? <div className="max-w-[52ch] text-ink-2">{children}</div> : null}
      {action ? <div className="mt-1 flex flex-wrap gap-2.5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  action,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border-2 border-brick bg-brick-tint px-5 py-4">
      <p className="font-display text-lg font-extrabold text-brick-dark">{title}</p>
      <p className="text-brick-dark">{message}</p>
      {action}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-ghost btn-sm mt-1">
          Try again
        </button>
      ) : null}
    </div>
  );
}

function AlertIcon({ triangle = false }: { triangle?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className="mt-0.5 flex-none"
    >
      {triangle ? (
        <>
          <path d="M12 3l9 16H3z" />
          <path d="M12 10v4M12 17v.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.5" />
        </>
      )}
    </svg>
  );
}

/** Inline error under a form or row action; announced to screen readers. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex gap-2 text-[15px] text-brick">
      <AlertIcon />
      <span>{message}</span>
    </p>
  );
}

/** Small tinted box: a failed email, or an overlap warning. */
export function Notice({ tone, children }: { tone: "failed" | "warn"; children: ReactNode }) {
  const cls = tone === "failed" ? "bg-brick-tint text-brick-dark" : "bg-sun-tint text-ochre-ink";
  return (
    <p className={`flex gap-2 rounded-lg px-3 py-2 text-[15px] ${cls}`}>
      {tone === "failed" ? <AlertIcon triangle /> : null}
      <span>{children}</span>
    </p>
  );
}
