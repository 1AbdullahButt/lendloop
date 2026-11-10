// Sign-up is reachable: the /sign-up route renders Clerk's <SignUp>, every place that names the
// sign-up URL agrees on "/sign-up", and the signed-out home page links to it (header and hero),
// so a visitor never has to find the small footer link inside the sign-in card.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const SIGN_UP_PAGE = "app/sign-up/[[...sign-up]]/page.tsx";

describe("sign-up wiring", () => {
  test("the /sign-up catch-all route renders Clerk's SignUp on that path", () => {
    expect(existsSync(SIGN_UP_PAGE)).toBe(true);
    const page = read(SIGN_UP_PAGE);
    expect(page).toMatch(/<SignUp\b[^>]*path="\/sign-up"/);
    expect(page).toMatch(/signInUrl="\/sign-in"/);
  });

  test("sign-in card, provider and middleware all point to /sign-up", () => {
    expect(read("app/sign-in/[[...sign-in]]/page.tsx")).toMatch(/<SignIn\b[^>]*signUpUrl="\/sign-up"/);
    expect(read("app/layout.tsx")).toMatch(/signUpUrl="\/sign-up"/);
    expect(read("middleware.ts")).toMatch(/signUpUrl: "\/sign-up"/);
  });

  test("/sign-up is not behind the signed-in redirect", () => {
    const matcher = /createRouteMatcher\(\[([^\]]*)\]\)/.exec(read("middleware.ts"))?.[1] ?? "";
    expect(matcher).not.toMatch(/sign-up|"\/\(\.\*\)"/);
  });

  test("the signed-out home page links to /sign-up in the header and the hero", () => {
    const home = read("app/page.tsx");
    expect(home.match(/href="\/sign-up"/g)?.length).toBe(2);
    expect(home).toMatch(/>\s*Sign up\s*</);
    expect(home).toMatch(/New here\? Create an account/);
    // The locked AC1 link stays.
    expect(home).toMatch(/Sign in to lend or borrow/);
  });
});
