import { expect, test } from "vitest";
import { displayName } from "../../convex/lib/auth";

test("displayName prefers the Clerk name", () => {
  expect(displayName({ name: "  Ada Lovelace ", email: "ada@example.com" })).toBe("Ada Lovelace");
});

test("displayName falls back to the email local part without a +tag", () => {
  expect(displayName({ email: "lender+clerk_test@example.com" })).toBe("Lender");
  expect(displayName({ email: "bea.seed_borrower@example.com" })).toBe("Bea Seed Borrower");
});

test("displayName uses Neighbour when the token has neither name nor email", () => {
  expect(displayName({})).toBe("Neighbour");
  expect(displayName({ name: "  ", email: "" })).toBe("Neighbour");
});
