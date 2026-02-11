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

export interface GrantsGovOpportunity {
  id: string;
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  status: string;
  alnList: string;
  link: string;
}

export interface PrimeAward {
  awardId: string;
  recipientName: string;
  amount: number;
  agency: string;
  subAgency: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface SubAward {
  subAwardId: string;
  subAwardeeName: string;
  amount: number;
  primeAwardId: string;
  primeRecipientName: string;
  date: string;
  description: string;
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

  async trackGrantsGov(aln: string): Promise<GrantsGovOpportunity[]> {
    const data = await invokeDiscovery({ action: "track_grants_gov", aln });
    return data.results || [];
  },

  async trackPrimeAwards(aln: string, startDate?: string, endDate?: string): Promise<{ results: PrimeAward[]; totalCount: number }> {
    const data = await invokeDiscovery({ action: "track_prime", aln, startDate, endDate });
    return { results: data.results || [], totalCount: data.totalCount || 0 };
  },

  async trackSubAwards(aln: string, startDate?: string, endDate?: string): Promise<{ results: SubAward[]; totalCount: number }> {
    const data = await invokeDiscovery({ action: "track_sub", aln, startDate, endDate });
    return { results: data.results || [], totalCount: data.totalCount || 0 };
  },
};
