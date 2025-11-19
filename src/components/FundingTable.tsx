import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFundingRecords } from "@/hooks/useFundingData";

interface FundingTableProps {
  state?: string;
}

export function FundingTable({ state }: FundingTableProps) {
  const { data: fundingRecords, isLoading } = useFundingRecords(state);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(0)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">
          Organizations Receiving Funding
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Key government agencies and departments with active funding
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead>Funding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fundingRecords && fundingRecords.length > 0 ? (
              fundingRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">
                    {record.organizations.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{record.verticals.name}</Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(Number(record.amount))}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-accent text-accent-foreground">
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {record.organizations.last_updated || "N/A"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No funding records found. Add data to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
