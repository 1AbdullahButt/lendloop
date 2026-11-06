/// <reference types="vite/client" />
// Module map for convex-test. The negated pattern skips multi-dot files
// (this file, *.test.ts); Vite 8 does not support the old extglob form.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.*.*s"]);
