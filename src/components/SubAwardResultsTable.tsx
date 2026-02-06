import { useState, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { SubAwardResult } from "@/hooks/useSubAwardSearch";
import { ChevronLeft, ChevronRight, Trash2, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PushToClayButton } from "@/components/PushToClayButton";

interface SubAwardResultsTableProps {
  results: SubAwardResult[];
  total: number;
  loading: boolean;
  page: number;
  hasNext: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onClear: () => void;
}

type SortColumn = "subRecipient" | "primeAwardee" | "amount" | "date" | "location" | null;
type SortDirection = "asc" | "desc";

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

function escapeCsvValue(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportToCsv(results: SubAwardResult[]) {
  const headers = [
    "Sub-Recipient",
    "Funded By (Prime)",
    "Amount",
    "Date",
    "Location",
    "Description",
  ];

  const rows = results.map((award) => [
    escapeCsvValue(award.subRecipient),
    escapeCsvValue(award.primeAwardee),
    award.amount.toString(),
    award.date || "",
    escapeCsvValue(formatLocation(award.city, award.stateCode)),
    escapeCsvValue(award.description || ""),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `sub-awards-${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SortableHeader({
  column,
  currentColumn,
  direction,
  onClick,
  children,
  className,
}: {
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
  onClick: (column: SortColumn) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isActive = currentColumn === column;
  
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${className || ""}`}
      onClick={() => onClick(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </TableHead>
  );
}

export function SubAwardResultsTable({
  results,
  total,
  loading,
  page,
  hasNext,
  onNextPage,
  onPrevPage,
  onClear,
}: SubAwardResultsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedResults = useMemo(() => {
    if (!sortColumn) return results;

    return [...results].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortColumn) {
        case "subRecipient":
          aVal = a.subRecipient.toLowerCase();
          bVal = b.subRecipient.toLowerCase();
          break;
        case "primeAwardee":
          aVal = a.primeAwardee.toLowerCase();
          bVal = b.primeAwardee.toLowerCase();
          break;
        case "amount":
          aVal = a.amount;
          bVal = b.amount;
          break;
        case "date":
          aVal = a.date || "";
          bVal = b.date || "";
          break;
        case "location":
          aVal = formatLocation(a.city, a.stateCode).toLowerCase();
          bVal = formatLocation(b.city, b.stateCode).toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [results, sortColumn, sortDirection]);

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
              Try adjusting your ALN number or keywords
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
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{total.toLocaleString()} sub-awards found</Badge>
            <PushToClayButton
              dataType="subawards"
              records={sortedResults.map(award => ({
                subAwardId: award.subAwardId,
                subRecipient: award.subRecipient,
                primeAwardee: award.primeAwardee,
                amount: award.amount,
                date: award.date || null,
                city: award.city || null,
                stateCode: award.stateCode || null,
                description: award.description || null,
              }))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(sortedResults)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  column="subRecipient"
                  currentColumn={sortColumn}
                  direction={sortDirection}
                  onClick={handleSort}
                >
                  Sub-Recipient
                </SortableHeader>
                <SortableHeader
                  column="primeAwardee"
                  currentColumn={sortColumn}
                  direction={sortDirection}
                  onClick={handleSort}
                >
                  Funded By (Prime)
                </SortableHeader>
                <SortableHeader
                  column="amount"
                  currentColumn={sortColumn}
                  direction={sortDirection}
                  onClick={handleSort}
                  className="text-right"
                >
                  Amount
                </SortableHeader>
                <SortableHeader
                  column="date"
                  currentColumn={sortColumn}
                  direction={sortDirection}
                  onClick={handleSort}
                >
                  Date
                </SortableHeader>
                <SortableHeader
                  column="location"
                  currentColumn={sortColumn}
                  direction={sortDirection}
                  onClick={handleSort}
                >
                  Location
                </SortableHeader>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((award, index) => (
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

        {/* Pagination Controls */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} · Showing {results.length} of {total.toLocaleString()} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevPage}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNextPage}
              disabled={!hasNext}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
