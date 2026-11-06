import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// QA L3: a pending request whose start date has passed must not become an approved loan.
test("approve rejects a pending request whose start date has passed", async () => {
  const t = convexTest(schema, modules);
  const lender = t.withIdentity({ subject: "lender", name: "Lena", email: "lena@example.com" });
  const borrower = t.withIdentity({ subject: "borrower", name: "Bo", email: "bo@example.com" });
  const lenderRow = await lender.mutation(api.users.ensure, {});
  const borrowerRow = await borrower.mutation(api.users.ensure, {});
  const toolId = await lender.mutation(api.tools.create, {
    name: "Ladder",
    category: "hand_tools",
    condition: "good",
    description: "",
  });
  // Inserted directly: loans.request would (correctly) refuse a past start date.
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId,
      borrowerId: borrowerRow._id,
      lenderId: lenderRow._id,
      startDate: isoDay(-2),
      endDate: isoDay(3),
      status: "pending",
      createdAt: Date.now(),
    }),
  );

  const err = await lender.mutation(api.loans.approve, { loanId }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ConvexError);
  expect((err as ConvexError<{ code: string }>).data.code).toBe("INVALID");

  const after = await t.run(async (ctx) => ({
    loan: await ctx.db.get(loanId),
    tool: await ctx.db.get(toolId),
  }));
  expect(after.loan?.status).toBe("pending");
  expect(after.tool?.status).toBe("available");

  // Declining the stale request still works, so the lender can clear it.
  await lender.mutation(api.loans.decline, { loanId });
  const declined = await t.run((ctx) => ctx.db.get(loanId));
  expect(declined?.status).toBe("declined");
});
