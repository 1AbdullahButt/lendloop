// AC1: the public page, signed out. No data is seeded for e2e, so the tools region
// may show items or its empty state (docs/DECISIONS.md); AC2 covers the projection.
import { expect, test } from "@playwright/test";

const TAGLINE = "Borrow what you need. Lend what you don't.";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

test.describe("AC1: public page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("AC1: / is reachable signed out (no redirect)", async ({ page }) => {
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("AC1: shows the LendLoop name as the main heading and the tagline", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /LendLoop/ })).toBeVisible();
    await expect(page.getByText(TAGLINE, { exact: true })).toBeVisible();
  });

  test("AC1: shows a 'Sign in to lend or borrow' button or link", async ({ page }) => {
    const cta = page
      .getByRole("button", { name: "Sign in to lend or borrow" })
      .or(page.getByRole("link", { name: "Sign in to lend or borrow" }));
    await expect(cta.first()).toBeVisible();
  });

  test("AC1: shows the tools region with either tool items or the empty state", async ({ page }) => {
    const region = page.getByTestId("public-tools");
    await expect(region).toBeVisible();
    const items = region.getByTestId("public-tool-item");
    const empty = region.getByTestId("public-tools-empty");
    // Wait for the live query to resolve into one of the two states.
    await expect(items.first().or(empty)).toBeVisible({ timeout: 15_000 });

    const count = await items.count();
    if (count === 0) {
      await expect(empty).toBeVisible();
      return;
    }
    await expect(empty).toHaveCount(0);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.getByTestId("public-tool-name")).toHaveText(/\S/);
      await expect(item.getByTestId("public-tool-category")).toHaveText(/\S/);
    }
  });

  test("AC1: renders no owner information and no email addresses", async ({ page }) => {
    const region = page.getByTestId("public-tools");
    await expect(
      region.getByTestId("public-tool-item").first().or(region.getByTestId("public-tools-empty")),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[data-testid*="owner" i]')).toHaveCount(0);
    await expect(region.locator('[data-testid*="status" i], [data-testid*="condition" i]')).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(EMAIL);
    const html = await page.content();
    expect(html).not.toMatch(/ownerId|ownerName|ownerEmail|ownerTrusted/);
  });
});
