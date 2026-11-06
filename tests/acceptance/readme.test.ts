// @vitest-environment node
// AC20: README covers setup, env vars, architecture, security, data minimisation, production changes.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const ROOT = process.cwd();
let readme = "";
let headings: string[] = [];

function envNames(): string[] {
  const text = readFileSync(join(ROOT, ".env.example"), "utf8");
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names];
}

/** Text from a heading matching `re` up to the next heading of the same or higher level. */
function section(re: RegExp): string {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && re.test(l));
  if (start < 0) return "";
  const level = /^(#+)/.exec(lines[start])![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#+)\s/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

beforeAll(() => {
  const path = join(ROOT, "README.md");
  if (existsSync(path)) readme = readFileSync(path, "utf8");
  headings = readme.split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l));
});

describe("AC20: README", () => {
  test("AC20: README.md exists and is not the create-next-app boilerplate", () => {
    expect(readme.length, "README.md is missing or empty").toBeGreaterThan(0);
    expect(readme).toMatch(/LendLoop/);
    expect(readme).not.toMatch(/This is a \[Next\.js\]\(https:\/\/nextjs\.org\) project bootstrapped/);
  });

  test("AC20: has a setup section covering Clerk, Convex, n8n and docker-compose", () => {
    expect(headings.some((h) => /setup|getting started|run locally|installation/i.test(h)), "setup heading").toBe(true);
    const setup = section(/setup|getting started|run locally|installation/i);
    // Sub-sections are part of the setup section, so search the whole block.
    expect(setup).toMatch(/Clerk/);
    expect(setup).toMatch(/Convex/);
    expect(setup).toMatch(/n8n/);
    expect(setup).toMatch(/docker[- ]compose/i);
  });

  test("AC20: documents both admin bootstrap paths (ADMIN_EMAILS and the internal setRole mutation)", () => {
    expect(readme).toContain("ADMIN_EMAILS");
    expect(readme).toMatch(/setRole/);
  });

  test("AC20: has an env vars table listing every name in .env.example", () => {
    const tableRows = readme.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
    expect(tableRows.length, "a markdown table").toBeGreaterThan(2);
    const missing = envNames().filter((n) => !tableRows.some((row) => row.includes(n)));
    expect(missing, "env vars missing from the README table").toEqual([]);
  });

  test("AC20: has an architecture diagram in a ```mermaid block", () => {
    expect(readme).toMatch(/```mermaid\s*\n[\s\S]+?\n```/);
  });

  test("AC20: has security, data-minimisation and production-changes sections", () => {
    expect(headings.some((h) => /security/i.test(h)), "security heading").toBe(true);
    expect(headings.some((h) => /data[- ]minimi[sz]ation/i.test(h)), "data minimisation heading").toBe(true);
    expect(headings.some((h) => /production/i.test(h)), "production changes heading").toBe(true);
    const security = section(/security/i);
    expect(security).toMatch(/HMAC/);
    expect(security).toMatch(/idempoten/i);
  });
});
