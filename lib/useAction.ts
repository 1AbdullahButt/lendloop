"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./errors";

/**
 * Wraps a one-off async call (usually a Convex mutation) with pending + readable error state,
 * so every button can disable itself and show the server's ConvexError message.
 */
export function useAction<Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await fn(...args);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
