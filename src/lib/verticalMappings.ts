// Mapping of verticals to Federal Agency ALN/CFDA prefixes
export const VERTICAL_MAPPINGS: Record<string, string[]> = {
  "Aging Services": ["93"],
  "CVI Prevention": ["16"],
  "Education": ["84"],
  "Energy & Environment": ["81", "66"],
  "Healthcare": ["93"],
  "Higher Education": ["84"],
  "Home Visiting": ["93"],
  "K-12 Education": ["84"],
  "Medicaid": ["93"],
  "Public Health": ["93"],
  "Public Safety": ["16", "97"],
  "Re-entry": ["16"],
  "Transportation": ["20"],
  "Transportation & Infrastructure": ["20"],
  "Veterans": ["64"],
  "Workforce Development": ["17"],
  "Other": [],
};

/**
 * Given an array of vertical names, returns deduplicated ALN prefixes.
 */
export function getAlnPrefixesForVerticals(verticals: string[]): string[] {
  const prefixes = new Set<string>();
  for (const v of verticals) {
    const mapped = VERTICAL_MAPPINGS[v];
    if (mapped) {
      for (const p of mapped) prefixes.add(p);
    }
  }
  return Array.from(prefixes);
}
