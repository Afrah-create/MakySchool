import { cn } from "../../lib/cn";

export const MAKYSCHOOL_LOGO_SRC = "/makyschool-logo.jpeg";

type BrandLogoProps = {
  size?: number;
  className?: string;
  imgClassName?: string;
  alt?: string;
  src?: string;
  rounded?: "none" | "md" | "xl";
};

export function BrandLogo({
  size = 40,
  className,
  imgClassName,
  alt = "MakySchool",
  src = MAKYSCHOOL_LOGO_SRC,
  rounded = "xl",
}: BrandLogoProps) {
  const radius =
    rounded === "none" ? "rounded-none" : rounded === "md" ? "rounded-lg" : "rounded-xl";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/90",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={cn("h-full w-full object-contain p-0.5", imgClassName)}
      />
    </span>
  );
}
