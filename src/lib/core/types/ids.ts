/** A UUID, as produced by `gen_random_uuid()`. */
export type UUID = string;

/** An ISO-8601 timestamp with timezone, e.g. `2026-08-23T18:30:00Z`. */
export type Timestamp = string;

/** An ISO calendar date with no time component, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Local wall-clock time, `HH:mm`, 24-hour. Never a 12-hour display string. */
export type ClockTime = string;
