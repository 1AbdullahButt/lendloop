import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="py-6 text-sm text-stone-500">
      <span
        aria-hidden="true"
        className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600 align-[-1px]"
      />
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  children,
  testId,
}: {
  title: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-8 text-center"
    >
      <p className="font-medium text-stone-700">{title}</p>
      {children ? <div className="mt-1 text-sm text-stone-500">{children}</div> : null}
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
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm">
      <p className="font-medium text-red-800">{title}</p>
      <p className="mt-1 text-red-700">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 font-medium text-red-800 hover:bg-red-100"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Inline error under a form or row action; announced to screen readers. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-red-700">
      {message}
    </p>
  );
}
