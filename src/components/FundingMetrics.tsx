import { Card } from "@/components/ui/card";
import { DollarSign, Building2, TrendingUp, Activity } from "lucide-react";
import { useFundingMetrics } from "@/hooks/useFundingData";

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-3xl font-bold mt-2 text-foreground">{value}</h3>
          <p className="text-sm mt-2 text-muted-foreground">{description}</p>
        </div>
        <div className="p-3 bg-primary/10 rounded-lg">
          {icon}
        </div>
      </div>
    </Card>
  );
}

interface FundingMetricsProps {
  state?: string;
  startDate?: Date;
  endDate?: Date;
  verticalIds?: string[];
}

export function FundingMetrics({ state, startDate, endDate, verticalIds }: FundingMetricsProps) {
  const { data: metrics, isLoading } = useFundingMetrics(state, startDate, endDate, verticalIds);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-20 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Total Organizations"
        value={metrics?.totalOrganizations.toLocaleString() || "0"}
        description="Government agencies receiving funding"
        icon={<Building2 className="h-6 w-6 text-primary" />}
      />
      <MetricCard
        title="Total Funding"
        value={formatCurrency(metrics?.totalFunding || 0)}
        description="Across all programs and verticals"
        icon={<DollarSign className="h-6 w-6 text-primary" />}
      />
      <MetricCard
        title="Average Funding"
        value={formatCurrency(metrics?.avgFunding || 0)}
        description="Per organization"
        icon={<TrendingUp className="h-6 w-6 text-primary" />}
      />
      <MetricCard
        title="Active Programs"
        value={metrics?.activePrograms.toLocaleString() || "0"}
        description="Currently funded initiatives"
        icon={<Activity className="h-6 w-6 text-primary" />}
      />
    </div>
  );
}
