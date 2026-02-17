/**
 * Build a PostgREST "or" filter that applies the date range to:
 * - action_date when present
 * - date_range_start as a fallback
 * - date_range_end as a final fallback (record is "active" during the filtered period)
 *
 * This ensures records with NULL action_date AND NULL date_range_start are still
 * included if their date_range_end indicates they are active during the filter period.
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

  // Both bounds: record matches if any of these is true:
  // 1. action_date is within range
  // 2. action_date is null, date_range_start is within range
  // 3. both action_date and date_range_start are null, but date_range_end >= filter start (active during period)
  if (startStr && endStr) {
    return [
      `and(action_date.gte.${startStr},action_date.lte.${endStr})`,
      `and(action_date.is.null,date_range_start.gte.${startStr},date_range_start.lte.${endStr})`,
      `and(action_date.is.null,date_range_start.is.null,date_range_end.gte.${startStr})`,
    ].join(",");
  }

  // Start only
  if (startStr) {
    return [
      `action_date.gte.${startStr}`,
      `and(action_date.is.null,date_range_start.gte.${startStr})`,
      `and(action_date.is.null,date_range_start.is.null,date_range_end.gte.${startStr})`,
    ].join(",");
  }

  // End only
  return [
    `action_date.lte.${endStr}`,
    `and(action_date.is.null,date_range_start.lte.${endStr})`,
    `and(action_date.is.null,date_range_start.is.null,date_range_end.lte.${endStr})`,
  ].join(",");
}
