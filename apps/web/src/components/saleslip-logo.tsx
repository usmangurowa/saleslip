import { cn } from "@turbo/ui/lib/utils";

const sizes = {
  sm: 20,
  md: 32,
  lg: 40,
  xl: 56,
} as const;

type LogoSize = keyof typeof sizes;

interface SaleslipLogoProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Size preset for the logo.
   * @default "md"
   */
  size?: LogoSize;
}

/**
 * Saleslip logo mark — a WiFi signal rendered as an inline SVG so it inherits
 * `currentColor` and scales crisply across nav, auth, and sidebar contexts.
 *
 * @example
 * ```tsx
 * <SaleslipLogo size="lg" className="text-primary" />
 * ```
 */
export const SaleslipLogo = ({
  size = "md",
  className,
  ...props
}: SaleslipLogoProps) => {
  const dimension = sizes[size];

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path d="M2.5 9.5a13.5 13.5 0 0 1 19 0" />
      <path d="M5.5 12.75a9 9 0 0 1 13 0" />
      <path d="M8.5 16a4.5 4.5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
};
