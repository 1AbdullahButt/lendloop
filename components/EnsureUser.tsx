"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { TimeZoneProvider } from "./TimeZone";
import { ErrorState, LoadingState } from "./ui/States";

type Phase = "ensuring" | "ready" | "error";
type Status = { userId: string; phase: Phase; error?: string };

/**
 * Queries can't create the `users` row, so a brand-new user's first query would throw
 * UNAUTHENTICATED. This gate calls `users.ensure` once Convex has the Clerk token and only
 * then mounts the signed-in page (and its queries).
 *
 * The result is tied to the Clerk user it was obtained for. If the account changes without a
 * page reload, the stored status no longer matches, so children unmount immediately (no frame
 * with the new account's queries running before its row exists) and ensure runs again.
 */
export function EnsureUser({
  children,
  header,
}: {
  children: ReactNode;
  /** Page chrome; told whether the user row exists, so it can hold back its own queries. */
  header?: (ready: boolean) => ReactNode;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const ensure = useMutation(api.users.ensure);
  const [status, setStatus] = useState<Status | null>(null);
  // Which user ensure was started for. A ref (not state) so strict mode's double effect
  // still calls ensure only once per user.
  const startedFor = useRef<string | null>(null);
  // Every run gets a number; only the latest may store its result. During an account switch
  // an older call (for the previous user, or an earlier try) can resolve last.
  const latestRun = useRef(0);

  const runEnsure = useCallback(
    async (forUser: string) => {
      const run = ++latestRun.current;
      setStatus({ userId: forUser, phase: "ensuring" });
      try {
        await ensure({});
        if (run === latestRun.current) setStatus({ userId: forUser, phase: "ready" });
      } catch (err) {
        if (run === latestRun.current) {
          setStatus({ userId: forUser, phase: "error", error: errorMessage(err) });
        }
      }
    },
    [ensure],
  );

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      // Signed out: whoever signs in next gets ensured afresh.
      startedFor.current = null;
      return;
    }
    if (startedFor.current === userId) return;
    startedFor.current = userId;
    void runEnsure(userId);
  }, [isAuthenticated, userId, runEnsure]);

  const pending = (body: ReactNode) => (
    <>
      {header?.(false)}
      <div className="wrap py-8">{body}</div>
    </>
  );

  if (isLoading) return pending(<LoadingState label="Signing you in…" />);

  if (!isAuthenticated) {
    return pending(
      <ErrorState
        title="You're not signed in"
        message="Your session could not be verified. Please sign in again."
        action={
          <Link href="/sign-in" className="font-bold">
            Go to sign in
          </Link>
        }
      />
    );
  }

  // Status for a different (previous) account counts as not started.
  const current = status && status.userId === userId ? status : null;

  if (current?.phase === "error") {
    return pending(
      <ErrorState
        title="We couldn't set up your account"
        message={current.error ?? "Please try again."}
        onRetry={() => void runEnsure(current.userId)}
      />
    );
  }

  if (current?.phase !== "ready") return pending(<LoadingState label="Setting up your account…" />);

  // The time zone needs the users row, so it starts here; the header and page share it.
  return (
    <TimeZoneProvider>
      {header?.(true)}
      {children}
    </TimeZoneProvider>
  );
}
