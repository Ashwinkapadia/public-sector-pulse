import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StateSelector } from "@/components/StateSelector";
import { DateRangeSlider } from "@/components/DateRangeSlider";
import { PrimeAwardSubawards } from "@/components/PrimeAwardSubawards";
import { SubawardNetworkDiagram } from "@/components/SubawardNetworkDiagram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SubawardsDetail() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().getFullYear() - 2, 0, 1),
    new Date(),
  ]);

  // Fetch data for network diagram
  const { data: networkData } = useQuery({
    queryKey: ["network-data", selectedState, dateRange[0], dateRange[1]],
    queryFn: async () => {
      let query = supabase
        .from("funding_records")
        .select(`
          id,
          amount,
          fiscal_year,
          action_date,
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
        .order("amount", { ascending: false })
        .limit(20);

      if (selectedState && selectedState !== "ALL") {
        query = query.eq("organization.state", selectedState);
      }

      const { data: records, error } = await query;
      if (error) throw error;

      // Filter by date range
      let filteredRecords = records as any[];
      if (dateRange[0] || dateRange[1]) {
        filteredRecords = filteredRecords.filter((record: any) => {
          const actionDate = record.action_date;
          if (!actionDate) return false;
          const date = new Date(actionDate);
          if (dateRange[0] && date < dateRange[0]) return false;
          if (dateRange[1] && date > dateRange[1]) return false;
          return true;
        });
      }

      const fundingRecordIds = filteredRecords.map((r) => r.id);
      if (fundingRecordIds.length === 0) return [];

      // Fetch subawards
      const { data: subawards, error: subawardsError } = await supabase
        .from("subawards")
        .select(`
          id,
          amount,
          award_date,
          funding_record_id,
          recipient_organization:organizations!subawards_recipient_organization_id_fkey(
            id,
            name,
            state,
            city
          )
        `)
        .in("funding_record_id", fundingRecordIds);

      if (subawardsError) throw subawardsError;

      // Group subawards
      const subawardsByFunding = new Map();
      (subawards || []).forEach((subaward: any) => {
        if (!subawardsByFunding.has(subaward.funding_record_id)) {
          subawardsByFunding.set(subaward.funding_record_id, []);
        }
        subawardsByFunding.get(subaward.funding_record_id)!.push(subaward);
      });

      return filteredRecords
        .filter((record) => subawardsByFunding.has(record.id))
        .map((record) => ({
          ...record,
          subawards: subawardsByFunding.get(record.id) || [],
        }));
    },
    enabled: selectedState !== "",
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Subaward Details</h1>
          <p className="mt-2 text-muted-foreground">
            View prime awards and their associated subaward recipients
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Filter prime awards and subawards by state and date range
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <StateSelector
              value={selectedState}
              onChange={setSelectedState}
            />
            <DateRangeSlider
              startDate={dateRange[0]}
              endDate={dateRange[1]}
              onStartDateChange={(date) => date && setDateRange([date, dateRange[1]])}
              onEndDateChange={(date) => date && setDateRange([dateRange[0], date])}
            />
          </CardContent>
        </Card>

        <Tabs defaultValue="list" className="w-full">
          <TabsList>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="network">Network Diagram</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-6">
            <PrimeAwardSubawards
              state={selectedState}
              startDate={dateRange[0]}
              endDate={dateRange[1]}
            />
          </TabsContent>
          <TabsContent value="network" className="mt-6">
            <SubawardNetworkDiagram data={networkData || []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
