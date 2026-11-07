/** Two linked loops: the lender's and the borrower's. */
export function LogoMark({ dark = false, size = "md" }: { dark?: boolean; size?: "md" | "lg" }) {
  const [w, h] = size === "lg" ? [34, 22] : [30, 20];
  return (
    <svg width={w} height={h} viewBox="0 0 34 22" aria-hidden="true" fill="none" strokeWidth="3">
      <circle cx="11" cy="11" r="8.5" stroke={dark ? "#F3F4F1" : "#15201B"} />
      <circle cx="23" cy="11" r="8.5" stroke={dark ? "#F5C518" : "#1F6B4E"} />
    </svg>
  );
}

export function Wordmark({ dark = false, size = "md" }: { dark?: boolean; size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark dark={dark} size={size} />
      <span
        className={`font-display font-extrabold ${size === "lg" ? "text-[22px]" : "text-[20px]"}`}
        style={{ fontStretch: "112%" }}
      >
        LendLoop
      </span>
    </span>
  );
}
