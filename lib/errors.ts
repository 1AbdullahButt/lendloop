import { ConvexError } from "convex/values";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

type ErrorData = { code?: string; message?: string };

function errorData(err: unknown): ErrorData | null {
  if (err instanceof ConvexError && typeof err.data === "object" && err.data !== null) {
    return err.data as ErrorData;
  }
  return null;
}

/** The ConvexError code (UNAUTHENTICATED, FORBIDDEN, ...) or null for unexpected errors. */
export function errorCode(err: unknown): string | null {
  return errorData(err)?.code ?? null;
}

/**
 * A message that is safe and useful to show. Server messages come from ConvexError data,
 * which survives production redaction; anything else gets a generic line.
 */
export function errorMessage(err: unknown): string {
  const data = errorData(err);
  if (data?.message) return data.message;
  switch (data?.code) {
    case "UNAUTHENTICATED":
      return "Please sign in again.";
    case "FORBIDDEN":
      return "You don't have permission to do that.";
    case "NOT_FOUND":
      return "That item no longer exists.";
    default:
      return "Something went wrong. Please try again.";
  }
}
