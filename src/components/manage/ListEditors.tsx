'use client';

import { FIELD, GhostButton } from './ui';

/**
 * An editable list of named rows — teams for a draw, courts for a gym.
 *
 * Rows keep a stable id across renames, which is what lets a stored result
 * survive a team being renamed mid-day. Order matters and is stated where it
 * does: for teams, list order is seeding order.
 */

export interface NamedRow {
  id: string;
  name: string;
}

export function NameListEditor({
  label,
  rows,
  onChange,
  mintId,
  min = 0,
  max = 40,
  placeholderFor,
  addLabel,
  note,
}: {
  label: string;
  rows: NamedRow[];
  onChange: (rows: NamedRow[]) => void;
  /** Supplied by the caller so this component stays free of id policy. */
  mintId: () => string;
  min?: number;
  max?: number;
  placeholderFor: (index: number) => string;
  addLabel: string;
  note?: string;
}) {
  const rename = (id: string, name: string) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, name } : row)));

  return (
    <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="text-micro-legal text-ink-muted-80">{label}</legend>
      {note && <p className="text-micro-legal text-ink-muted-80">{note}</p>}
      <div className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="w-5 text-right text-micro-legal text-ink-muted-80">{index + 1}</span>
            <input
              type="text"
              value={row.name}
              placeholder={placeholderFor(index)}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => rename(row.id, event.target.value)}
              className={`${FIELD} w-56 max-w-full`}
            />
            <GhostButton
              onClick={() => onChange(rows.filter((other) => other.id !== row.id))}
              disabled={rows.length <= min}
              title={rows.length <= min ? `At least ${min} required` : 'Remove'}
            >
              Remove
            </GhostButton>
          </div>
        ))}
      </div>
      <div>
        <GhostButton
          onClick={() => onChange([...rows, { id: mintId(), name: '' }])}
          disabled={rows.length >= max}
        >
          {addLabel}
        </GhostButton>
      </div>
    </fieldset>
  );
}
