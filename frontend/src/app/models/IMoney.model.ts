/**
 * Money arrives from the backend as a STRING, never a number.
 *
 * Decimal columns are serialised as `str(...)` deliberately: 0.1 + 0.2 !== 0.3
 * in IEEE-754, so a bill that arrives as a float has already lost cents by the
 * time the frontend sees it. A POS screen that displays a wrong total is worse
 * than one that shows "0.30" twice.
 *
 * `toAmount` is the single place that crosses that boundary. Every screen goes
 * through it (via the currency pipe) so no component does its own parsing or
 * rounding, and an unparseable value becomes 0 rather than NaN on screen.
 */

/**
 * Coerce a money value from the API into a number, for display and grouping.
 *
 * Never throws. A null, undefined or malformed value yields 0: the caller is a
 * template pipe, and a thrown error there would blank the cell instead of
 * showing something honest about a bad value.
 *
 * Not for arithmetic that feeds a business decision. Parsing a decimal string
 * into an IEEE-754 double is exactly the loss described above, so a running
 * total must stay a string or a decimal type all the way to the backend.
 */
export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
