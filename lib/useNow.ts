"use client";

import { useEffect, useState } from "react";

/** Current time that ticks every `intervalMs`, so "today" and overdue labels stay fresh. */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
