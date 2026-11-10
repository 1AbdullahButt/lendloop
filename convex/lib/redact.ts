// Free text that leaves Convex for an admin screen (n8n and network error messages) must not
// carry anyone's address. Same pattern as the n8n error handler's redact().
const EMAIL_SHAPED = /[^\s@"'<>]+@[^\s@"'<>]+/g;

export function redactEmails(text: string): string {
  return text.replace(EMAIL_SHAPED, "[redacted-email]");
}
