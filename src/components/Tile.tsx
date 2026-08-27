/**
 * A full-bleed section. Tiles stack edge to edge with no gap and no border —
 * the surface-colour change is itself the divider, which is why nothing in
 * this file draws a rule between sections.
 *
 * Alternate light and dark to create the section rhythm. Two consecutive dark
 * tiles should use `dark` then `dark-2`, whose one-step lightness difference
 * is the faintest separation the system allows.
 */

type Surface = 'canvas' | 'parchment' | 'dark' | 'dark-2' | 'dark-3';

const SURFACES: Record<Surface, string> = {
  canvas: 'bg-canvas text-ink',
  parchment: 'bg-parchment text-ink',
  dark: 'bg-tile-1 text-on-dark',
  'dark-2': 'bg-tile-2 text-on-dark',
  'dark-3': 'bg-tile-3 text-on-dark',
};

/** Text-heavy sections lock narrower than product grids. */
const WIDTHS = {
  narrow: 'max-w-[980px]',
  wide: 'max-w-[1440px]',
} as const;

export function Tile({
  surface = 'canvas',
  width = 'narrow',
  id,
  className,
  children,
}: {
  surface?: Surface;
  width?: keyof typeof WIDTHS;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={SURFACES[surface]}>
      {/* 80px of air, tightening to 48px on small phones. */}
      <div
        className={['mx-auto px-6 py-12 sm:py-20', WIDTHS[width], className]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </section>
  );
}

/** True on any surface where Action Blue would disappear. */
export function isDark(surface: Surface): boolean {
  return surface.startsWith('dark');
}
