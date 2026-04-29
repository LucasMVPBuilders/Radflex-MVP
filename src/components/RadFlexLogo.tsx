interface RadFlexLogoProps {
  /** "light" — purple lockup (use on light backgrounds)
   *  "dark"  — white lockup (use on dark backgrounds) */
  variant?: "light" | "dark";
  className?: string;
  alt?: string;
}

const SRC = {
  light: "/brand/radflex-logo-color.png",
  dark: "/brand/radflex-logo-white.png",
} as const;

export const RadFlexLogo = ({
  variant = "light",
  className = "h-7 w-auto",
  alt = "RadFlex",
}: RadFlexLogoProps) => (
  <img
    src={SRC[variant]}
    alt={alt}
    draggable={false}
    className={`select-none ${className}`}
  />
);
