import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSubawardsByState } from "@/hooks/useSubawards";
import { Skeleton } from "@/components/ui/skeleton";

interface SubawardsTableProps {
  state?: string;
}

export function SubawardsTable({ state }: SubawardsTableProps) {
  const { data: subawards, isLoading } = useSubawardsByState(state);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Card>
    );
  }

  if (!subawards || subawards.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">Subaward Recipients</h3>
        <p className="text-muted-foreground text-center py-8">
          No subaward data available yet. Subawards will appear here once funding is distributed to recipient agencies.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">Subaward Recipients</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Agencies receiving funding distribution {state ? `in ${state}` : "across all states"}
        </p>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient Organization</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Award Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subawards.map((subaward) => (
              <TableRow key={subaward.id}>
                <TableCell className="font-medium">
                  {subaward.recipient_organization?.name || "Unknown"}
                </TableCell>
                <TableCell>
                  {subaward.recipient_organization?.city && `${subaward.recipient_organization.city}, `}
                  {subaward.recipient_organization?.state || "N/A"}
                </TableCell>
                <TableCell className="font-semibold">
                  {formatCurrency(Number(subaward.amount))}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {subaward.description || "—"}
                </TableCell>
                <TableCell>
                  {subaward.award_date
                    ? new Date(subaward.award_date).toLocaleDateString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <div className="mt-4 text-sm text-muted-foreground">
        Showing {subawards.length} subaward recipient{subawards.length !== 1 ? "s" : ""}
      </div>
    </Card>
  );
}
