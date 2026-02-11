import { supabase } from "@/integrations/supabase/client";

export interface DiscoveredGrant {
  aln: string;
  title: string;
  agency: string;
  link: string;
  postedDate: string;
  closeDate: string;
  type: string;
}

export interface NIHProject {
  project_title: string;
  contact_pi_name: string;
  organization: { org_name: string; org_city: string; org_state: string };
  award_amount: number;
  fiscal_year: number;
  project_num: string;
}

export interface NSFAward {
  id: string;
  awardeeName: string;
  fundsObligatedAmt: string;
  title: string;
  startDate: string;
  expDate: string;
}

const invokeDiscovery = async (body: Record<string, unknown>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("discovery-search", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  return data;
};

export const PulseDiscoveryService = {
  async discoverNewALNs(startDate: string, endDate: string, alnPrefixes?: string[]): Promise<DiscoveredGrant[]> {
    const body: Record<string, unknown> = { action: "discover", startDate, endDate };
    if (alnPrefixes && alnPrefixes.length > 0) {
      body.alnPrefixes = alnPrefixes;
    }
    const data = await invokeDiscovery(body);
    return data.results || [];
  },

  async trackNIH(aln: string): Promise<NIHProject[]> {
    const data = await invokeDiscovery({ action: "track_nih", aln });
    return data.results || [];
  },

  async trackNSF(aln: string): Promise<NSFAward[]> {
    const data = await invokeDiscovery({ action: "track_nsf", aln });
    return data.results || [];
  },
};
