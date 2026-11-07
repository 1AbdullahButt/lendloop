import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger" | "danger-ghost";
type Size = "md" | "sm" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-pri",
  ghost: "btn-ghost",
  danger: "btn-danger",
  "danger-ghost": "btn-danger-ghost",
};

const SIZES: Record<Size, string> = { md: "", sm: "btn-sm", lg: "btn-lg" };

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={`btn ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props} />;
}

/** Class string for a Link styled as a button. */
export function buttonClass(variant: Variant = "ghost", size: Size = "md", extra = ""): string {
  return `btn ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}
