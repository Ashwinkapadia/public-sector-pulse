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

interface FundingChartProps {
  state?: string;
}

export function FundingChart({ state }: FundingChartProps) {
  // Mock data - will be replaced with real data from government sources
  const data = [
    {
      vertical: "Workforce Dev",
      funding: state === "CA" ? 26360 : 3060,
      organizations: state === "CA" ? 345 : 142,
    },
    {
      vertical: "Aging Services",
      funding: state === "CA" ? 406 : 245,
      organizations: state === "CA" ? 156 : 78,
    },
    {
      vertical: "Veterans",
      funding: state === "CA" ? 892 : 421,
      organizations: state === "CA" ? 89 : 45,
    },
    {
      vertical: "CVI Prevention",
      funding: state === "CA" ? 58 : 32,
      organizations: state === "CA" ? 67 : 34,
    },
    {
      vertical: "Home Visiting",
      funding: state === "CA" ? 45 : 28,
      organizations: state === "CA" ? 123 : 67,
    },
    {
      vertical: "Re-entry",
      funding: state === "CA" ? 34 : 19,
      organizations: state === "CA" ? 45 : 23,
    },
  ];

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">Funding by Vertical</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Total funding allocation across key program areas (in millions)
        </p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data}>
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
