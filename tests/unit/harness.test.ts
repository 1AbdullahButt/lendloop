import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";

// Proves the convex-test harness itself works, independent of feature code.
test("convex-test harness runs against the schema", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "harness",
      name: "Harness",
      email: "harness@example.com",
      role: "user",
      trustedLender: false,
    }),
  );
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.role).toBe("user");
});
