// HMAC-SHA256 over `${timestamp}.${body}` with Web Crypto only, so it runs in the
// default Convex runtime (no Node `crypto`).

const PREFIX = "sha256=";
const SIGNATURE = /^sha256=[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{1,16}$/;
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
  return PREFIX + toHex(mac);
}

/** Compares every character so timing does not reveal how much of a guess was right. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Never throws: anything malformed, stale or wrong is simply `false`. */
export async function verify(
  secret: string,
  timestamp: string,
  body: string,
  header: string,
  now: number,
): Promise<boolean> {
  try {
    if (!secret || !TIMESTAMP.test(timestamp) || !SIGNATURE.test(header)) return false;
    if (Math.abs(now - Number(timestamp)) > SIGNATURE_WINDOW_MS) return false;
    return constantTimeEqual(await sign(secret, timestamp, body), header);
  } catch {
    return false;
  }
}
