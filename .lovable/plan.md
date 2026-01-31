
Goal
- Fix “verticals filter shows all verticals” and “filtering is a mess” by making filtering consistent and server-driven across Table, Metrics, and Chart.
- Reduce “date range still wrong / old records” symptoms by eliminating client-side mismatches and adding deterministic filter application + lightweight diagnostics to prove what is being filtered.

What I found (current behavior / root causes)
1) Verticals filter is not applied consistently across components:
   - FundingTable receives verticalIds and filters client-side (it fetches all records for state/date and then filters in memory).
   - FundingMetrics applies verticalIds server-side (it uses `.in("vertical_id", verticalIds)`).
   - FundingChart does not accept verticalIds at all and intentionally initializes chart categories with “all verticals”, so it will always display all vertical bars even when you selected only 2 verticals.
   Result: the UI can look “wrong” because different widgets represent different filter sets.

2) useFundingRecords does not accept verticalIds
   - That forces the Table (and Chart) to fetch “all verticals” records and then rely on client-side filtering (or in the Chart’s case, not filter at all).
   - This also increases the chance of stale-looking data because “all verticals” data can remain in cache and components can render different subsets.

3) Date range complaints are likely exacerbated by inconsistent filtering and cache reuse
   - Your date filter logic is already centralized via buildAwardDateOrFilter() and query keys include state + dates (good).
   - But because useFundingRecords doesn’t include verticalIds in its query key, the same cached dataset is reused regardless of vertical selection, which makes the overall “filters are broken” feeling much worse (even when date filters are technically working).

Implementation plan (no database changes required)
A) Make useFundingRecords support vertical filtering (server-side)
- Update `useFundingRecords(state, startDate, endDate)` → `useFundingRecords(state, startDate, endDate, verticalIds?)`.
- Add verticalIds to:
  - queryKey: `["funding_records", state, toDateKey(startDate), toDateKey(endDate), verticalIds?.join(",") || ""]`
  - query: when verticalIds present, apply `query = query.in("vertical_id", verticalIds)`
- This ensures:
  - The backend query matches the UI filters.
  - TanStack Query caching differentiates different vertical selections.

B) Update FundingTable to stop doing “client-side vertical filtering”
- Change `FundingTable` to call `useFundingRecords(state, startDate, endDate, verticalIds)` directly.
- Remove the `filteredByVerticals` useMemo (or keep a defensive filter only if needed for safety; recommended: remove to avoid hiding bugs).
- This prevents “it looks like all verticals” due to stale data or mismatched filtering.

C) Update FundingChart to respect selected verticals
- Update FundingChart props to include `verticalIds?: string[]`.
- Pass verticalIds into useFundingRecords.
- Update chartData logic:
  - If verticalIds is empty: show all vertical categories (current behavior).
  - If verticalIds has values: only include those verticals in the chart categories (and optionally show them even if 0 funding, but only for the selected ones).
- This fixes the most visible “it’s showing all verticals” issue.

D) Ensure Index passes verticalIds everywhere consistently
- Update `src/pages/Index.tsx` to pass `selectedVerticals` into:
  - `<FundingChart ... verticalIds={selectedVerticals} />` (currently missing)
  - FundingTable already receives it
  - FundingMetrics already receives it
- Confirm the “Active filters” debug line includes the vertical IDs count already (it does).

E) Tighten refresh behavior after fetch completion (to avoid “page not refreshing” complaints)
- In `handleFetchComplete` (Index.tsx):
  - Make sure we invalidate/refetch `funding_records` in a way that covers the new queryKey shape (it will, since we use exact:false).
  - Add one additional invalidate/refetch for the chart if it uses a different key (it won’t once it uses the same hook).
  - Optional: replace `selectedVerticals.length` in the callback dependency list with `selectedVerticals.join(",")` to ensure the callback always has the latest filter state in debug logs (not strictly required for correctness, but avoids confusion while debugging).

F) Add a small “Filter Proof” debug block (temporary, removable)
To fully eliminate doubt about date filtering and “old records”, I will add a compact debug line (only visible in dev / behind a small “Debug” toggle) that shows:
- Returned records count
- Min/Max of “date used” (action_date || date_range_start) in the returned dataset
- This helps confirm whether the backend query is returning records outside the selected range, vs. the issue being ingestion/old stored dates.

Files that will be modified
- `src/hooks/useFundingData.ts`
  - Add verticalIds support to useFundingRecords (queryKey + `.in()` filter)
- `src/components/FundingTable.tsx`
  - Use the new hook signature; remove client-side vertical filtering
- `src/components/FundingChart.tsx`
  - Accept verticalIds; use the new hook signature; build chart categories based on selection
- `src/pages/Index.tsx`
  - Pass selectedVerticals into FundingChart; optionally refine refetch/invalidation + dependency stability

How we will test (end-to-end, in the UI)
1) Verticals filter correctness
- Select a state with data.
- Select exactly 2 verticals.
- Confirm:
  - Table rows only show those two verticals.
  - Metrics change when toggling a vertical on/off.
  - Chart only shows bars for those two verticals (not all verticals).

2) Date range correctness (sanity check)
- Set a 1-month range.
- Confirm “Active filters” line shows the same start/end.
- Confirm the debug “Filter Proof” min/max date sits inside the selected range (or explains which fallback date is used).

3) Refresh / no reload required
- Start a fetch with FetchProgress visible.
- When it reaches “completed”, confirm the UI updates without manual reload:
  - Table results update
  - Metrics update
  - Chart updates

Edge cases handled
- No verticals selected: behavior remains “show all verticals”.
- Vertical selected but there are zero records in date range: table shows empty; chart shows either empty or only the selected vertical categories with 0 values (we’ll pick whichever is clearer; default will be “selected categories only”).
- Avoids PostgREST filter collisions:
  - We keep the existing single `.or(dateOrFilter)` behavior and add `.in("vertical_id", ...)` in addition (these are compatible).

Notes on the “date issue again / old records”
- This plan fixes filtering consistency and removes the most common source of “it’s ignoring my filters” (Chart + server/client mismatch).
- If, after this, you still see records outside the selected date range, then the remaining problem is not filtering—it’s ingestion storing the wrong date value into `action_date` / `date_range_start` for some records. At that point we’ll instrument the ingestion pipeline per-source with a “date field extracted” log and compare it to what’s stored.

If you approve, I’ll implement A–E first (core correctness), then add the temporary debug block from F only if needed.
