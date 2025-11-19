import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrganizationDetail {
  id: string;
  name: string;
  state: string;
  employee_count: number | null;
  annual_revenue: number | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  zip_code: string | null;
  last_updated: string | null;
  rep_assignments: {
    id: string;
    rep_id: string;
    assigned_at: string;
    notes: string | null;
    profiles: {
      id: string;
      display_name: string | null;
      email: string | null;
    };
  } | null;
}

export function useOrganizationDetail(organizationId: string) {
  return useQuery({
    queryKey: ["organization", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select(`
          *,
          rep_assignments (
            id,
            rep_id,
            assigned_at,
            notes,
            profiles!rep_assignments_rep_id_fkey (
              id,
              display_name,
              email
            )
          )
        `)
        .eq("id", organizationId)
        .single();

      if (error) throw error;
      return data as OrganizationDetail;
    },
  });
}

export function useOrganizationFunding(organizationId: string) {
  return useQuery({
    queryKey: ["organization-funding", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funding_records")
        .select(`
          *,
          verticals (*)
        `)
        .eq("organization_id", organizationId)
        .order("date_range_start", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
