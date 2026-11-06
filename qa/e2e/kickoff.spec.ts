import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

// The take-home kit's manual checklist ("KICKOFF section 4", not in this repo), automated against the real stack. Users sign in with @clerk/testing's
// sign-in tokens (Clerk secret key from .env.local), so no password or code is typed.
// Screenshots mask every email that is not @example.com, the admin's own row and the Clerk
// user button. The admin email is read from Convex's ADMIN_EMAILS and never logged.

const LENDER_EMAIL = "lender+clerk_test@example.com";
const BORROWER_EMAIL = "borrower+clerk_test@example.com";

const SHOTS = "qa/screenshots";
const OVERDUE_WORKFLOW = process.env.N8N_OVERDUE_WORKFLOW_ID;
const stamp = Date.now().toString(36);
const DRILL = `QA drill ${stamp}`;
const SPARE = `QA spare ladder ${stamp}`;

type Row = Record<string, unknown> & { _id: string };

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
}

/** Reads a Convex table through the CLI (the dev deployment configured by `npx convex dev`). */
function convexData(table: string): Row[] {
  return sh(`npx convex data ${table} --format jsonl --limit 2000`)
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as Row);
}

/** Id of the imported overdue workflow; ids are per n8n instance, so look it up by name. */
function overdueWorkflowId(): string {
  if (OVERDUE_WORKFLOW) return OVERDUE_WORKFLOW;
  const line = sh("docker compose exec -T n8n n8n list:workflow")
    .split(/\r?\n/)
    .find((l) => l.endsWith("|LendLoop: overdue reminders"));
  if (!line) throw new Error('Import n8n/workflows/overdue-reminders.json first ("LendLoop: overdue reminders").');
  return line.split("|")[0].trim();
}

function runOverdueWorkflow(): void {
  // A second n8n process needs its own task-runner broker port next to the running server.
  sh(`docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=${overdueWorkflowId()}`);
}

/** First address in the Convex ADMIN_EMAILS env var. Kept in memory only. */
function adminEmail(): string {
  const env = sh("npx convex env list --include-values");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("ADMIN_EMAILS="));
  const first = line?.slice("ADMIN_EMAILS=".length).split(",")[0]?.trim();
  if (!first) throw new Error("ADMIN_EMAILS is not set in Convex.");
  return first;
}

const pages: Record<string, Page> = {};

/** One isolated browser context per user, signed in with a Clerk sign-in token. */
async function signedIn(browser: Browser, role: string, emailAddress: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  pages[role] = page;
  await page.goto("/"); // a public page that loads Clerk
  await clerk.signIn({ page, emailAddress });
  // Compare inside the page and return only a boolean, so no email reaches the test output.
  const isExpectedUser = await page.evaluate(
    (expected) =>
      window.Clerk?.user?.primaryEmailAddress?.emailAddress?.toLowerCase() === expected.toLowerCase(),
    emailAddress,
  );
  expect(isExpectedUser, `${role} context is signed in as the ${role} account`).toBe(true);
  await open(page, "/tools"); // runs EnsureUser, so the users row and ADMIN_EMAILS apply
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page;
}

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  // Diagnostics: every user's page at the moment of failure (masked), plus path and heading.
  for (const [role, page] of Object.entries(pages)) {
    if (page.isClosed()) continue;
    const heading = await page.getByRole("heading", { level: 1 }).first().textContent().catch(() => null);
    console.log(`[diag] ${role}: ${new URL(page.url()).pathname} | h1: ${heading ?? "(none)"}`);
    await page
      .screenshot({ path: testInfo.outputPath(`failure-${role}.png`), fullPage: true, mask: masks(page) })
      .catch(() => undefined);
  }
});

function masks(page: Page) {
  return [
    page.locator("td").filter({ hasText: /@(?!example\.com\b)/ }),
    page.locator("tr").filter({ has: page.locator("td", { hasText: /^admin$/i }) }),
    page.locator(".cl-userButtonTrigger, .cl-userButtonBox"),
  ];
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, mask: masks(page) });
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByText("Setting up your account")).toHaveCount(0, { timeout: 30_000 });
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test("KICKOFF 4: lend, borrow, approve, notify, moderate, remind once", async ({ browser }) => {
  const lender = await signedIn(browser, "lender", LENDER_EMAIL);
  const borrower = await signedIn(browser, "borrower", BORROWER_EMAIL);
  const admin = await signedIn(browser, "admin", adminEmail());
  await expect(admin.getByRole("link", { name: "Admin" })).toBeVisible();

  await test.step("A lists two tools", async () => {
    await open(lender, "/my/listings");
    for (const [name, category, description] of [
      [DRILL, "power_tools", "18V cordless drill with two batteries."],
      [SPARE, "hand_tools", "Spare listing for the admin removal check."],
    ]) {
      await lender.getByLabel("Name").fill(name);
      await lender.getByLabel("Category").selectOption(category);
      await lender.getByLabel(/^Description/).fill(description);
      await lender.getByRole("button", { name: "Add tool" }).click();
      await expect(lender.getByRole("region", { name: "Your tools" }).getByText(name)).toBeVisible();
    }
    await shot(lender, "01-lender-my-listings");
  });

  await test.step("B requests the drill", async () => {
    await open(borrower, "/tools");
    await borrower.getByRole("button", { name: `Request ${DRILL}` }).click();
    await borrower.getByRole("form", { name: `Request ${DRILL}` }).getByRole("button", { name: "Send request" }).click();
    await expect(borrower.getByRole("status").filter({ hasText: "Request sent" })).toBeVisible();
    await shot(borrower, "02-borrower-requested");
  });

  await test.step("A approves", async () => {
    await open(lender, "/my/incoming");
    await lender.getByRole("button", { name: `Approve request for ${DRILL}` }).click();
    const card = lender.locator("li").filter({ hasText: DRILL });
    await expect(card.getByText("approved", { exact: false }).first()).toBeVisible();
    await shot(lender, "03-lender-approved");
  });

  await test.step("B sees both notifications sent", async () => {
    await open(borrower, "/my/requests");
    const card = borrower.locator("li").filter({ hasText: DRILL });
    // requested -> lender, approved -> borrower; each goes Convex -> tunnel -> n8n.
    await expect(card.getByText(/Notification sent/)).toHaveCount(2, { timeout: 120_000 });
    await shot(borrower, "04-borrower-notification-sent");
  });

  const tools = convexData("tools");
  const drill = tools.find((t) => t.name === DRILL)!;
  const loan = convexData("loans").find((l) => l.toolId === drill._id)!;
  const users = convexData("users");
  const lenderName = String(users.find((u) => u._id === drill.ownerId)!.name);
  const borrowerId = String(loan.borrowerId);

  await test.step("Admin removes the spare listing and marks A Trusted Lender", async () => {
    await open(admin, "/admin");
    await admin.getByRole("button", { name: `Remove listing ${SPARE}` }).click();
    await admin.getByRole("button", { name: "Confirm remove" }).click();
    const spareRow = admin.locator("tr").filter({ hasText: SPARE });
    await expect(spareRow.getByText("removed", { exact: false })).toBeVisible();

    const trusted = admin.getByRole("checkbox", { name: `Trusted Lender for ${lenderName}` });
    if (!(await trusted.isChecked())) await trusted.click();
    await expect(trusted).toBeChecked();
    await shot(admin, "05-admin-removed-and-trusted");
  });

  await test.step("Removed listing is gone; Trusted badge shows to B", async () => {
    await open(borrower, "/tools");
    await expect(borrower.getByRole("heading", { name: SPARE })).toHaveCount(0);
    // Each tool card is one <li> in the /tools grid; the badge sits in its "Lent by" line.
    const drillCard = borrower.getByRole("listitem").filter({ has: borrower.getByRole("heading", { name: DRILL }) });
    await expect(drillCard.getByText("Trusted Lender")).toBeVisible();
    await shot(borrower, "06-borrower-trusted-badge");

    const guest = await browser.newPage();
    await guest.goto("/");
    // Wait until the list has loaded (items or the empty state), or the absence check is vacuous.
    await expect(guest.getByTestId("public-tool-item").or(guest.getByTestId("public-tools-empty")).first()).toBeVisible();
    await expect(guest.getByTestId("public-tool-name").filter({ hasText: SPARE })).toHaveCount(0);
    await guest.screenshot({ path: `${SHOTS}/07-public-page.png`, fullPage: true });
  });

  await test.step("Overdue reminder is sent once, not twice", async () => {
    const out = sh(`npx convex run seed:overdueLoan "{\\"borrowerId\\":\\"${borrowerId}\\"}"`);
    const seeded = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { loanId: string };
    const reminders = () =>
      convexData("automationEvents").filter((e) => e.kind === "overdue_reminder" && e.loanId === seeded.loanId);

    runOverdueWorkflow();
    const afterFirst = reminders();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].status).toBe("sent");

    runOverdueWorkflow();
    const afterSecond = reminders();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]).toEqual(afterFirst[0]);

    await open(borrower, "/my/requests");
    const card = borrower.locator("li").filter({ hasText: "Seed hedge trimmer" }).first();
    await expect(card.getByText(/Reminder sent/)).toBeVisible();
    await shot(borrower, "08-borrower-reminder-sent");
  });
});
