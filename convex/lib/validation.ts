import { appError } from "./errors";

export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 500;

export function cleanToolName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    throw appError("INVALID", `Name must be 1-${NAME_MAX} characters.`);
  }
  return name;
}

export function cleanDescription(raw: string): string {
  const description = raw.trim();
  if (description.length > DESCRIPTION_MAX) {
    throw appError("INVALID", `Description must be at most ${DESCRIPTION_MAX} characters.`);
  }
  return description;
}
