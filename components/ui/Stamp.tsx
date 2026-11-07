import type { CSSProperties, ReactNode } from "react";

export type StampTone = "pending" | "approved" | "declined" | "returned" | "cancelled" | "failed";

type Props = {
  tone: StampTone;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Degrees; a slight tilt makes it read as a hand stamp. */
  tilt?: number;
  /** Press it in: only for stamps that appear because of the user's own action. */
  press?: boolean;
  delayMs?: number;
  /** Given an id, the stamp can take focus so a screen reader lands on the result. */
  id?: string;
  className?: string;
};

export function Stamp({ tone, children, size = "md", tilt = 0, press = false, delayMs, id, className = "" }: Props) {
  const style: CSSProperties = tilt ? { rotate: `${tilt}deg` } : {};
  if (press && delayMs) style.animationDelay = `${delayMs}ms`;
  const sizeClass = size === "lg" ? "stamp-lg" : size === "sm" ? "stamp-sm" : "";
  return (
    <span
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`stamp s-${tone} ${sizeClass} ${press ? "stamp-in" : ""} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

const LOAN_TONE: Record<string, StampTone> = {
  pending: "pending",
  approved: "approved",
  declined: "declined",
  returned: "returned",
  cancelled: "cancelled",
};

// American spelling on screen; the stored status keeps the schema's "cancelled".
const LOAN_LABEL: Record<string, string> = { cancelled: "Canceled" };

export function loanStatusLabel(status: string): string {
  return LOAN_LABEL[status] ?? status;
}

export function LoanStamp({ status, ...rest }: { status: string } & Omit<Props, "tone" | "children">) {
  return (
    <Stamp tone={LOAN_TONE[status] ?? "cancelled"} {...rest}>
      {loanStatusLabel(status)}
    </Stamp>
  );
}

export function OverdueTag({ days, label, className = "" }: { days: number; label?: string; className?: string }) {
  return (
    <span className={`tag-yellow ${className}`}>{label ?? `Overdue · ${days} ${days === 1 ? "day" : "days"}`}</span>
  );
}
