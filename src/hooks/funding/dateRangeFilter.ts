/**
 * Build a PostgREST "or" filter that applies the date range to:
 * - action_date when present
 * - otherwise date_range_start as a fallback
 *
 * Important: PostgREST only supports a single `or=` param; calling `.or()` twice
 * can effectively override the previous one depending on the client.
 */
import { format } from "date-fns";

export function buildAwardDateOrFilter(params: {
  start?: Date;
  end?: Date;
}): string | null {
  const { start, end } = params;

  // IMPORTANT: use local date formatting (not toISOString) to avoid timezone
  // shifts that can move a selected day to the previous/next date.
  const startStr = start ? format(start, "yyyy-MM-dd") : null;
  const endStr = end ? format(end, "yyyy-MM-dd") : null;

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
