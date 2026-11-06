import { ConvexError } from "convex/values";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

export type AppErrorData = { code: ErrorCode; message: string };

/**
 * The only way functions report expected failures. Messages are generic on purpose:
 * they must never echo another user's name or email back to the caller.
 */
export function appError(code: ErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError<AppErrorData>({ code, message });
}
