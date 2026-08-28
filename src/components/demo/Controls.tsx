'use client';

import { useId } from 'react';

/**
 * The demo's control panel.
 *
 * The design system documents exactly two button grammars — the blue pill for
 * action and the compact dark rectangle for utility chrome — and warns that
 * mixing them is the mistake to avoid. A control panel wants neither: these
 * are inputs, not actions, and a row of blue pills would spend the one colour
 * this system reserves for "click me" on fourteen things at once.
 *
 * So numeric knobs are native `<select>`s dressed as utility cards, and
 * small mutually-exclusive choices are a segmented row that borrows the
 * utility rectangle's 8px radius. Native controls also come with keyboard
 * support and screen-reader labelling already correct, which a hand-rolled
 * stepper does not.
 */

const FIELD =
  'rounded-sm border border-hairline bg-canvas px-2.5 py-1.5 text-caption text-ink transition-transform duration-150 active:scale-95';

export function ControlPanel({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">{children}</div>
      {note && <p className="mt-4 text-caption text-ink-muted-80">{note}</p>}
    </div>
  );
}

/** A whole-number knob over a small range. */
export function NumberControl({
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-micro-legal text-ink-muted-80">
        {label}
      </label>
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
    </div>
  );
}

/** The same, but over an explicit list — pool counts are not a contiguous range. */
export function OptionControl({
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-micro-legal text-ink-muted-80">
        {label}
      </label>
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
    </div>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** A short, mutually exclusive list, laid out as a segmented row. */
export function ChoiceControl<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 border-0 p-0">
      <legend className="text-micro-legal text-ink-muted-80">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(choice.value)}
              className={
                selected
                  ? 'rounded-sm bg-ink px-3 py-1.5 text-button-utility text-on-dark transition-transform duration-150 active:scale-95'
                  : 'rounded-sm border border-hairline px-3 py-1.5 text-button-utility text-ink-muted-80 transition-transform duration-150 active:scale-95'
              }
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ToggleControl({
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
