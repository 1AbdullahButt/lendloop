// Mirrors the enums in convex/schema.ts; the server validates, these are display labels only.

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category] ?? category;
}

export function conditionLabel(condition: string): string {
  return CONDITION_LABELS[condition as Condition] ?? condition;
}

export const TOOL_NAME_MAX = 80;
export const TOOL_DESCRIPTION_MAX = 500;
