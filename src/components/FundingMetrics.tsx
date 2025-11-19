import { Card } from "@/components/ui/card";
import { TrendingUp, DollarSign, Building2, Calendar } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ReactNode;
  trend?: "up" | "down";
}

function MetricCard({ title, value, change, icon, trend }: MetricCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-3xl font-bold mt-2 text-foreground">{value}</h3>
          {change && (
            <p className={cn(
              "text-sm mt-2 flex items-center gap-1",
              trend === "up" ? "text-accent" : "text-destructive"
            )}>
              {trend === "up" && <TrendingUp className="h-4 w-4" />}
              {change}
            </p>
          )}
        </div>
        <div className="p-3 bg-primary/10 rounded-lg">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface FundingMetricsProps {
  state?: string;
}

export function FundingMetrics({ state }: FundingMetricsProps) {
  // Mock data - will be replaced with real data
  const metrics = {
    totalFunding: state === "CA" ? "$26.36B" : "$3.5B",
    activePrograms: state === "CA" ? "142" : "87",
    organizations: state === "CA" ? "1,247" : "638",
    lastUpdated: "March 2025",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Total Funding"
        value={metrics.totalFunding}
        change="+12.5% from last year"
        icon={<DollarSign className="h-6 w-6 text-primary" />}
        trend="up"
      />
      <MetricCard
        title="Active Programs"
        value={metrics.activePrograms}
        change="+8 new programs"
        icon={<Building2 className="h-6 w-6 text-primary" />}
        trend="up"
      />
      <MetricCard
        title="Organizations"
        value={metrics.organizations}
        icon={<Building2 className="h-6 w-6 text-primary" />}
      />
      <MetricCard
        title="Last Updated"
        value={metrics.lastUpdated}
        icon={<Calendar className="h-6 w-6 text-primary" />}
      />
    </div>
  );
}
