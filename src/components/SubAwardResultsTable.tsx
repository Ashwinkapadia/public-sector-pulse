import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubAwardResult } from "@/hooks/useSubAwardSearch";

interface SubAwardResultsTableProps {
  results: SubAwardResult[];
  total: number;
  loading: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatLocation(city: string, stateCode: string): string {
  if (city && stateCode) return `${city}, ${stateCode}`;
  if (city) return city;
  if (stateCode) return stateCode;
  return "N/A";
}

export function SubAwardResultsTable({
  results,
  total,
  loading,
}: SubAwardResultsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              Searching sub-awards...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <p className="text-lg">No sub-awards found</p>
            <p className="text-sm mt-2">
              Try adjusting your CFDA number or keywords
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Search Results</CardTitle>
          <Badge variant="secondary">{total} sub-awards found</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sub-Recipient</TableHead>
                <TableHead>Funded By (Prime)</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((award, index) => (
                <TableRow key={award.subAwardId || index}>
                  <TableCell className="font-medium max-w-[200px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {truncateText(award.subRecipient, 30)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{award.subRecipient}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {truncateText(award.primeAwardee, 30)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{award.primeAwardee}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(award.amount)}
                  </TableCell>
                  <TableCell>{formatDate(award.date)}</TableCell>
                  <TableCell>
                    {formatLocation(award.city, award.stateCode)}
                  </TableCell>
                  <TableCell className="max-w-[150px]">
                    {award.description ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default text-muted-foreground">
                            {truncateText(award.description, 50)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-sm">{award.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
