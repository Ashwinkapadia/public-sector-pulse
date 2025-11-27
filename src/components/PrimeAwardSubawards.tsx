import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Building2, ArrowRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface PrimeAwardSubawardsProps {
  state?: string;
  startDate?: Date;
  endDate?: Date;
}

interface FundingRecord {
  id: string;
  amount: number;
  fiscal_year: number;
  action_date: string | null;
  cfda_code: string | null;
  notes: string | null;
  organization: {
    id: string;
    name: string;
    state: string;
    city: string | null;
  };
  grant_type: {
    id: string;
    name: string;
  } | null;
  vertical: {
    id: string;
    name: string;
  };
}

interface Subaward {
  id: string;
  amount: number;
  award_date: string | null;
  description: string | null;
  recipient_organization: {
    id: string;
    name: string;
    state: string;
    city: string | null;
  };
}

export function PrimeAwardSubawards({ state, startDate, endDate }: PrimeAwardSubawardsProps) {
  const { data: fundingRecords, isLoading } = useQuery({
    queryKey: ["prime-awards-with-subawards", state, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("funding_records")
        .select(`
          id,
          amount,
          fiscal_year,
          action_date,
          cfda_code,
          notes,
          organization:organizations!funding_records_organization_id_fkey(
            id,
            name,
            state,
            city
          ),
          grant_type:grant_types(
            id,
            name
          ),
          vertical:verticals(
            id,
            name
          )
        `)
        .eq("source", "USAspending.gov")
        .order("amount", { ascending: false });

      if (state) {
        query = query.eq("organization.state", state);
      }

      const { data: records, error } = await query;

      if (error) throw error;

      // Filter by date range on client side
      let filteredRecords = records as any[];
      if (startDate || endDate) {
        filteredRecords = filteredRecords.filter((record: any) => {
          const actionDate = record.action_date;
          if (!actionDate) return false;

          const date = new Date(actionDate);
          if (startDate && date < startDate) return false;
          if (endDate && date > endDate) return false;

          return true;
        });
      }

      // Get funding record IDs
      const fundingRecordIds = filteredRecords.map((r) => r.id);

      if (fundingRecordIds.length === 0) {
        return [];
      }

      // Fetch subawards for these funding records
      const { data: subawards, error: subawardsError } = await supabase
        .from("subawards")
        .select(`
          id,
          amount,
          award_date,
          description,
          funding_record_id,
          recipient_organization:organizations!subawards_recipient_organization_id_fkey(
            id,
            name,
            state,
            city
          )
        `)
        .in("funding_record_id", fundingRecordIds)
        .order("amount", { ascending: false });

      if (subawardsError) throw subawardsError;

      // Group subawards by funding record
      const subawardsByFunding = new Map<string, Subaward[]>();
      (subawards || []).forEach((subaward: any) => {
        if (!subawardsByFunding.has(subaward.funding_record_id)) {
          subawardsByFunding.set(subaward.funding_record_id, []);
        }
        subawardsByFunding.get(subaward.funding_record_id)!.push(subaward);
      });

      // Only return funding records that have subawards
      return filteredRecords
        .filter((record) => subawardsByFunding.has(record.id))
        .map((record) => ({
          ...record,
          subawards: subawardsByFunding.get(record.id) || [],
        }));
    },
    enabled: !!state,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const stats = useMemo(() => {
    if (!fundingRecords) return { totalPrimeAwards: 0, totalSubawards: 0, totalPrimeAmount: 0, totalSubawardAmount: 0 };

    let totalSubawards = 0;
    let totalSubawardAmount = 0;
    let totalPrimeAmount = 0;

    fundingRecords.forEach((record: any) => {
      totalPrimeAmount += record.amount;
      totalSubawards += record.subawards.length;
      record.subawards.forEach((sub: Subaward) => {
        totalSubawardAmount += sub.amount;
      });
    });

    return {
      totalPrimeAwards: fundingRecords.length,
      totalSubawards,
      totalPrimeAmount,
      totalSubawardAmount,
    };
  }, [fundingRecords]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!state) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Please select a state to view subaward details</p>
        </CardContent>
      </Card>
    );
  }

  if (!fundingRecords || fundingRecords.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No prime awards with subawards found for the selected filters</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prime Awards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPrimeAwards}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Subawards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSubawards}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prime Award Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPrimeAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subaward Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalSubawardAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Prime Awards with Subawards */}
      <div className="space-y-4">
        {fundingRecords.map((record: any) => (
          <PrimeAwardCard key={record.id} record={record} formatCurrency={formatCurrency} formatDate={formatDate} />
        ))}
      </div>
    </div>
  );
}

function PrimeAwardCard({ record, formatCurrency, formatDate }: { record: any; formatCurrency: (n: number) => string; formatDate: (d: string | null) => string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-1">
                  {isOpen ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{record.organization.name}</CardTitle>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="secondary">{record.vertical.name}</Badge>
                    {record.grant_type && (
                      <Badge variant="outline">{record.grant_type.name}</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {record.organization.city && `${record.organization.city}, `}
                      {record.organization.state}
                    </span>
                    <span className="text-muted-foreground">FY {record.fiscal_year}</span>
                  </div>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="text-2xl font-bold text-primary">{formatCurrency(record.amount)}</div>
                <div className="text-sm text-muted-foreground">
                  {record.subawards.length} subaward{record.subawards.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
                <span className="font-medium">Subaward Recipients</span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Award Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {record.subawards.map((subaward: Subaward) => (
                    <TableRow key={subaward.id}>
                      <TableCell className="font-medium">
                        {subaward.recipient_organization.name}
                      </TableCell>
                      <TableCell>
                        {subaward.recipient_organization.city && `${subaward.recipient_organization.city}, `}
                        {subaward.recipient_organization.state}
                      </TableCell>
                      <TableCell>{formatDate(subaward.award_date)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(subaward.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {record.subawards.length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-end">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Total Subaward Value</div>
                    <div className="text-xl font-bold">
                      {formatCurrency(
                        record.subawards.reduce((sum: number, sub: Subaward) => sum + sub.amount, 0)
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
