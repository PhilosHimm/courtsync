/**
 * A box that scrolls sideways on a phone — a table wider than the screen.
 *
 * It has to be focusable, or a keyboard user can see the table but never
 * scroll it (WCAG 2.1.1; axe: scrollable-region-focusable). A focusable
 * container needs a name, so it is a labelled section. This is the one
 * place a non-interactive element takes tabIndex, and why.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable to be scrolled by keyboard.
    <section tabIndex={0} aria-label={label} className={className}>
      {children}
    </section>
  );
}
