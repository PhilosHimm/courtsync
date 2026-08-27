import Link from 'next/link';

/**
 * The button vocabulary, in one place so the grammars cannot drift.
 *
 * There are two, and mixing them is the mistake this file exists to prevent:
 * the blue pill (rounded-full) means "action", and the compact dark rectangle
 * (rounded-sm) means "utility chrome". Nothing sits in between.
 *
 * Deliberately no hover states. The source system documents default and
 * pressed only, and press is always the same gesture — scale(0.95).
 */

type Variant = 'primary' | 'secondary' | 'utility' | 'hero';

const VARIANTS: Record<Variant, string> = {
  // Action Blue on a full pill. This is the brand's entire "click me" signal.
  primary: 'bg-primary text-on-dark text-body rounded-full px-[22px] py-[11px]',
  // The ghost pill, used only as the second CTA beside a primary one.
  secondary: 'border border-primary text-primary text-body rounded-full px-[22px] py-[11px]',
  // Chrome, not action: compact rectangle at the 8px radius.
  utility: 'bg-ink text-on-dark text-button-utility rounded-sm px-[15px] py-2',
  // A larger primary, used sparingly. Weight 300 at 18px is intentional.
  hero: 'bg-primary text-on-dark text-button-large rounded-full px-7 py-[14px]',
};

const BASE =
  'inline-flex items-center justify-center whitespace-nowrap transition-transform duration-150 active:scale-95';

function classes(variant: Variant, className?: string) {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(' ');
}

interface ButtonLinkProps {
  href: string;
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

/** An internal route. */
export function ButtonLink({ href, variant = 'primary', children, className }: ButtonLinkProps) {
  return (
    <Link href={href} className={classes(variant, className)}>
      {children}
    </Link>
  );
}

/** An external destination, or a same-page anchor. */
export function ButtonAnchor({ href, variant = 'primary', children, className }: ButtonLinkProps) {
  return (
    <a href={href} className={classes(variant, className)}>
      {children}
    </a>
  );
}

/**
 * An inline text link. Action Blue on light surfaces; Sky Link Blue on dark
 * tiles, where Action Blue would disappear into the surface.
 */
export function TextLink({
  href,
  onDark,
  children,
}: {
  href: string;
  onDark?: boolean;
  children: React.ReactNode;
}) {
  const color = onDark ? 'text-primary-on-dark' : 'text-primary';
  const external = href.startsWith('http');
  const className = `${color} text-body`;

  return external ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
