/**
 * Build a PostgREST "or" filter that applies the date range to:
 * - action_date when present
 * - otherwise date_range_start as a fallback (unless strictActionDateOnly is true)
 *
 * When strictActionDateOnly is true, only records with a non-null action_date
 * are included, excluding those that rely on date_range_start fallback.
 *
 * Important: PostgREST only supports a single `or=` param; calling `.or()` twice
 * can effectively override the previous one depending on the client.
 */
export function buildAwardDateOrFilter(params: {
  start?: Date;
  end?: Date;
  strictActionDateOnly?: boolean;
}): string | null {
  const { start, end, strictActionDateOnly } = params;

  const startStr = start ? start.toISOString().split("T")[0] : null;
  const endStr = end ? end.toISOString().split("T")[0] : null;

  // Strict mode: only include records with action_date (no fallback)
  if (strictActionDateOnly) {
    // Must have action_date (not null)
    if (startStr && endStr) {
      return `and(action_date.not.is.null,action_date.gte.${startStr},action_date.lte.${endStr})`;
    }
    if (startStr) {
      return `and(action_date.not.is.null,action_date.gte.${startStr})`;
    }
    if (endStr) {
      return `and(action_date.not.is.null,action_date.lte.${endStr})`;
    }
    // No date filters but strict mode: just require action_date to exist
    return `action_date.not.is.null`;
  }

  // No filters
  if (!startStr && !endStr) return null;

  // Both bounds
  if (startStr && endStr) {
    return [
      `and(action_date.gte.${startStr},action_date.lte.${endStr})`,
      `and(action_date.is.null,date_range_start.gte.${startStr},date_range_start.lte.${endStr})`,
    ].join(",");
  }

  // Start only
  if (startStr) {
    return [
      `action_date.gte.${startStr}`,
      `and(action_date.is.null,date_range_start.gte.${startStr})`,
    ].join(",");
  }

  // End only
  return [
    `action_date.lte.${endStr}`,
    `and(action_date.is.null,date_range_start.lte.${endStr})`,
  ].join(",");
}
