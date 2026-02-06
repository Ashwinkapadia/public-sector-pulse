/**
 * Shared USAspending API filter utilities
 * Ensures consistent filtering logic across prime and sub-award searches
 */

export interface TimeRange {
  start_date: string;
  end_date: string;
}

export interface BaseFilters {
  award_type_codes: string[];
  time_period: TimeRange[];
  program_numbers?: string[];
  keywords?: string[];
  recipient_locations?: { country: string; state: string }[];
  place_of_performance_locations?: { country: string; state: string }[];
  agencies?: { type: string; tier: string; name: string }[];
}

/**
 * Get base filters for USAspending API calls
 * Rule 1: program_numbers must be an Array of Strings, even for single values
 * Rule 2: award_type_codes 02-05 are specifically for Grants (not contracts/loans)
 */
export const getBaseFilters = (options: {
  alnNumber?: string;
  keywords?: string;
  startDate?: string;
  endDate?: string;
  state?: string;
  agencies?: string[];
  useRecipientLocation?: boolean; // true for prime awards, false for sub-awards
}): BaseFilters => {
  const {
    alnNumber,
    keywords,
    startDate,
    endDate,
    state,
    agencies,
    useRecipientLocation = true,
  } = options;

  // Default to current fiscal year if no dates provided
  const defaultStartDate = "2024-10-01";
  const defaultEndDate = "2025-09-30";

  const filters: BaseFilters = {
    // Grant award type codes: 02=Block, 03=Formula, 04=Project, 05=Cooperative Agreement
    award_type_codes: ["02", "03", "04", "05"],
    time_period: [
      {
        start_date: startDate || defaultStartDate,
        end_date: endDate || defaultEndDate,
      },
    ],
  };

  // Rule 1: Always use array format for program_numbers
  if (alnNumber?.trim()) {
    const alnList = alnNumber.split(",").map(c => c.trim()).filter(c => c.length > 0);
    filters.program_numbers = alnList;
  }

  // Keywords filter
  if (keywords?.trim()) {
    filters.keywords = [keywords.trim()];
  }

  // State/location filter - different field for prime vs sub-awards
  if (state?.trim() && state !== "ALL") {
    if (useRecipientLocation) {
      // Prime awards use recipient_locations
      filters.recipient_locations = [{ country: "USA", state: state }];
    } else {
      // Sub-awards use place_of_performance_locations
      filters.place_of_performance_locations = [{ country: "USA", state: state }];
    }
  }

  // Agency filter
  if (agencies && agencies.length > 0) {
    filters.agencies = agencies.map(name => ({
      type: "awarding",
      tier: "toptier",
      name: name,
    }));
  }

  return filters;
};

/**
 * Prime award field names
 */
export const PRIME_AWARD_FIELDS = [
  "Award ID",
  "Internal ID",
  "Recipient Name",
  "Recipient Location",
  "Award Amount",
  "Award Type",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Start Date",
  "End Date",
  "Action Date",
  "Description",
  "CFDA Number",
  "CFDA Title",
];

/**
 * Sub-award field names (Rule 3: different field names when subawards: true)
 */
export const SUB_AWARD_FIELDS = [
  "Sub-Award ID",
  "Sub-Awardee Name",
  "Prime Recipient Name",
  "Sub-Award Amount",
  "Sub-Award Date",
  "Sub-Award Description",
  "Sub-Award Primary Place of Performance",
  "Prime Award ID",
];
