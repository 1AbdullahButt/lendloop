"use client";

import { useEffect, useState } from "react";

/** Current time that ticks every `intervalMs`, so "2 minutes ago" labels stay fresh. */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
