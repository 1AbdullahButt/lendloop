"use client";

import type { ReactNode } from "react";
import { AppHeader } from "./AppNav";
import { EnsureUser } from "./EnsureUser";
import { QueryBoundary } from "./ui/QueryBoundary";

/** Client wrapper so the layout can hand EnsureUser a header render function. */
export function SignedInShell({ children }: { children: ReactNode }) {
  return (
    <EnsureUser
      header={(ready) => (
        // If the header's own queries fail, fall back to the bare header instead of an error box.
        <QueryBoundary fallback={<AppHeader ready={false} />}>
          <AppHeader ready={ready} />
        </QueryBoundary>
      )}
    >
      <main id="main">{children}</main>
    </EnsureUser>
  );
}
