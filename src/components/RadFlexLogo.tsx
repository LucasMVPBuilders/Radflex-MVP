interface RadFlexLogoProps {
  /** "light" — purple icon + purple text (use on light backgrounds)
   *  "dark"  — white icon + white text (use on dark backgrounds) */
  variant?: "light" | "dark";
  className?: string;
}

export const RadFlexLogo = ({ variant = "light", className = "" }: RadFlexLogoProps) => {
  const colorClass = variant === "dark" ? "text-white" : "text-primary";
  return (
    <span className={`inline-flex items-center gap-2 ${colorClass} ${className}`}>
      <RadFlexIcon />
      <span
        className="leading-none"
        style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "-0.5px" }}
      >
        radflex.
      </span>
    </span>
  );
};

const RadFlexIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* R letter */}
    <path
      fill="currentColor"
      d="M4 2h7c2.5 0 4 1.4 4 3.5 0 1.6-.9 2.8-2.5 3.3l3 4.2h-2.5l-2.7-3.8H6.2V13H4V2zm2.2 2v3h4.4c1.1 0 1.7-.5 1.7-1.5S11.7 4 10.6 4H6.2z"
    />
    {/* Wavy flag lines */}
    <path
      d="M3 16c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M3 19c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M3 22c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);
