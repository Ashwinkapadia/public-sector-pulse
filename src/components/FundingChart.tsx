import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useFundingRecords, useVerticals } from "@/hooks/useFundingData";
import { useMemo } from "react";

interface FundingChartProps {
  state?: string;
  startDate?: Date;
  endDate?: Date;
  verticalIds?: string[];
}

export function FundingChart({ state, startDate, endDate, verticalIds }: FundingChartProps) {
  // Now passes verticalIds so the chart only fetches data for selected verticals
  const { data: fundingRecords, isLoading: loadingRecords } = useFundingRecords(state, startDate, endDate, verticalIds);
  const { data: verticals, isLoading: loadingVerticals } = useVerticals();

  const chartData = useMemo(() => {
    if (!fundingRecords || !verticals) return [];

    // Determine which verticals to show categories for
    const selectedVerticalSet = new Set(verticalIds || []);
    const verticalsToShow = verticalIds && verticalIds.length > 0
      ? verticals.filter(v => selectedVerticalSet.has(v.id))
      : verticals;

    // Initialize map only with the verticals we want to display
    const verticalMap = new Map<string, { funding: number; organizations: Set<string> }>();
    
    verticalsToShow.forEach((vertical) => {
      verticalMap.set(vertical.name, { funding: 0, organizations: new Set() });
    });

    // Add funding data for verticals that have records
    fundingRecords.forEach((record) => {
      const verticalName = record.verticals.name;
      const entry = verticalMap.get(verticalName);
      if (entry) {
        entry.funding += Number(record.amount) / 1_000_000; // Convert to millions
        entry.organizations.add(record.organization_id);
      }
    });

    return Array.from(verticalMap.entries()).map(([name, data]) => ({
      vertical: name.length > 15 ? name.substring(0, 15) + "..." : name,
      funding: Math.round(data.funding),
      organizations: data.organizations.size,
    }));
  }, [fundingRecords, verticals, verticalIds]);

  if (loadingRecords || loadingVerticals) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">Funding by Vertical</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Total funding allocation across key program areas (in millions)
        </p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="vertical"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            tickFormatter={(value) => `$${value}M`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend />
          <Bar
            dataKey="funding"
            fill="hsl(var(--primary))"
            radius={[8, 8, 0, 0]}
            name="Funding ($M)"
          />
          <Bar
            dataKey="organizations"
            fill="hsl(var(--accent))"
            radius={[8, 8, 0, 0]}
            name="Organizations"
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
