'use client';

import { useId } from 'react';

/**
 * Shared chrome for the manage screens — the functional, locally-persisted
 * side of the app, as distinct from the demo's invented data.
 *
 * Same design grammar as the rest of the site: inputs are utility cards, the
 * blue pill stays reserved for the one real action on a screen, and section
 * headings match the demo boards so a user moving from the demo to their own
 * event recognizes the furniture.
 */

export const FIELD =
  'rounded-sm border border-hairline bg-canvas px-2.5 py-1.5 text-caption text-ink';

/**
 * The standing fact about where data lives. Required on every manage screen.
 * Chrome, not an alert — parchment and a hairline, like the demo's notice.
 */
export function LocalDataNotice() {
  return (
    <p className="rounded-sm border border-hairline bg-parchment px-4 py-3 text-caption text-ink-muted-80">
      Your data is saved locally in this browser and will not sync across devices. Sign-in and
      cloud sync will be added later.
    </p>
  );
}

/** A section heading inside a manage board. Mirrors the demo's BoardHeading. */
export function SectionHeading({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="text-tagline text-ink">{children}</h2>
      {note && <p className="text-caption text-ink-muted-80">{note}</p>}
    </div>
  );
}

/** Something the engine reported it could not do. Stated, never hidden. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm border border-hairline bg-parchment px-4 py-3 text-caption text-ink">
      {children}
    </p>
  );
}

function FieldShell({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-micro-legal text-ink-muted-80">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD} ${wide ? 'min-w-[16rem]' : ''}`}
      />
    </FieldShell>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
    </FieldShell>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
    </FieldShell>
  );
}

/** A whole-number knob over a small range, as a select — same as the demo. */
export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const id = useId();
  const options = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  return (
    <FieldShell id={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        className={FIELD}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** The same, over an explicit list — pool counts are not a contiguous range. */
export function OptionField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  onChange: (next: number) => void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        className={FIELD}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-micro-legal text-ink-muted-80">&nbsp;</span>
      <label htmlFor={id} className="flex items-center gap-2 text-caption text-ink">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        {label}
      </label>
    </div>
  );
}

/** The compact utility rectangle, as a real button. */
export function UtilityButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-sm bg-ink px-[15px] py-2 text-button-utility text-on-dark transition-transform duration-150 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A quiet bordered button for secondary or destructive-ish row actions. */
export function GhostButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-sm border border-hairline px-3 py-1.5 text-button-utility text-ink-muted-80 transition-transform duration-150 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The blue pill — one per screen, on the screen's one real action. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary px-[22px] py-[11px] text-body text-on-dark transition-transform duration-150 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Mint an id in the browser. Falls back for older engines. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The moment an event handler fires, as an ISO timestamp. */
export function nowIso(): string {
  return new Date().toISOString();
}
