// Pure unit tests for convex/lib/hmac.ts (AC14 signer, AC15 verifier).
import { describe, expect, test } from "vitest";
import { sign, verify } from "../../convex/lib/hmac";
import { referenceSign } from "./_helpers";

const SECRET = "test-secret-vector";
const TS = "1762430400000";
const BODY = '{"hello":"world"}';
// Precomputed offline: HMAC-SHA256("test-secret-vector", '1762430400000.{"hello":"world"}').
const KNOWN = "sha256=2dd1e6734862aa90660e5f6d440bb2544a0d9767768ffd6157717fbad7b885c7";
const NOW = Number(TS);
const MIN = 60 * 1000;

describe("AC14: sign", () => {
  test("AC14: sign returns sha256=<lowercase hex> matching a known vector", async () => {
    const sig = await sign(SECRET, TS, BODY);
    expect(sig).toBe(KNOWN);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  test("AC14: sign signs timestamp + '.' + body (matches an independent Web Crypto implementation)", async () => {
    for (const body of ["", "{}", '{"eventId":"abc","type":"loan.requested"}', "ünïcödé ✓"]) {
      expect(await sign(SECRET, TS, body)).toBe(await referenceSign(SECRET, TS, body));
    }
  });

  test("AC14: different secret, timestamp or body give a different signature", async () => {
    const base = await sign(SECRET, TS, BODY);
    expect(await sign("other-secret", TS, BODY)).not.toBe(base);
    expect(await sign(SECRET, String(NOW + 1), BODY)).not.toBe(base);
    expect(await sign(SECRET, TS, BODY + " ")).not.toBe(base);
  });
});

describe("AC15: verify", () => {
  test("AC15: a correct signature inside the window verifies", async () => {
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW)).toBe(true);
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW + 4 * MIN + 59_000)).toBe(true);
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW - 4 * MIN - 59_000)).toBe(true);
  });

  test("AC15: the empty body (signed GET) round-trips", async () => {
    const sig = await sign(SECRET, TS, "");
    expect(await verify(SECRET, TS, "", sig, NOW)).toBe(true);
    expect(await verify(SECRET, TS, "x", sig, NOW)).toBe(false);
  });

  test("AC15: stale timestamps (more than 5 minutes either direction) are rejected", async () => {
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW + 5 * MIN + 1_000)).toBe(false);
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW - 5 * MIN - 1_000)).toBe(false);
    expect(await verify(SECRET, TS, BODY, KNOWN, NOW + 60 * MIN)).toBe(false);
  });

  test("AC15: wrong secret is rejected", async () => {
    expect(await verify("wrong-secret", TS, BODY, KNOWN, NOW)).toBe(false);
  });

  test("AC15: tampered body or timestamp is rejected", async () => {
    expect(await verify(SECRET, TS, '{"hello":"World"}', KNOWN, NOW)).toBe(false);
    expect(await verify(SECRET, TS, `${BODY}\n`, KNOWN, NOW)).toBe(false);
    const ts2 = String(NOW + 1000);
    expect(await verify(SECRET, ts2, BODY, KNOWN, NOW)).toBe(false);
  });

  test("AC15: malformed or missing signature headers are rejected (no throw)", async () => {
    const hex = KNOWN.slice("sha256=".length);
    const bad = [
      "",
      hex, // missing prefix
      "sha256=",
      `sha1=${hex}`,
      `sha256=${hex.slice(0, 63)}`, // too short
      `sha256=${hex}00`, // too long
      `sha256=${"z".repeat(64)}`, // not hex
      `sha256=${hex.replace(/^./, (c) => (c === "0" ? "1" : "0"))}`, // one char off
      `  ${KNOWN}  `.repeat(2),
    ];
    for (const h of bad) {
      await expect(verify(SECRET, TS, BODY, h, NOW), `header ${JSON.stringify(h)}`).resolves.toBe(false);
    }
  });

  test("AC15: non-numeric or empty timestamps are rejected (no throw)", async () => {
    for (const ts of ["", "abc", "NaN", "12e3", "-1"]) {
      const sig = await sign(SECRET, ts, BODY);
      await expect(verify(SECRET, ts, BODY, sig, NOW), `timestamp ${JSON.stringify(ts)}`).resolves.toBe(false);
    }
  });

  test("AC15: sign/verify round-trip for a fresh timestamp", async () => {
    const now = Date.now();
    const ts = String(now);
    const body = JSON.stringify({ idempotencyKey: "k:2026-11-06", status: "sent" });
    const sig = await sign("round-trip-secret", ts, body);
    expect(await verify("round-trip-secret", ts, body, sig, now + 1000)).toBe(true);
  });
});
