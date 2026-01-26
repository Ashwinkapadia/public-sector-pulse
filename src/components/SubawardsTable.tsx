import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useSubawardsByState } from "@/hooks/useSubawards";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Download } from "lucide-react";
import ExcelJS from "exceljs";

interface SubawardsTableProps {
  state?: string;
  startDate?: Date;
  endDate?: Date;
}

type SortField = "organization" | "location" | "amount" | "awardDate";
type SortOrder = "asc" | "desc";

export function SubawardsTable({ state, startDate, endDate }: SubawardsTableProps) {
  const { data: subawards, isLoading } = useSubawardsByState(state, startDate, endDate);
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedSubawards = useMemo(() => {
    if (!subawards) return [];
    
    const sorted = [...subawards].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "organization":
          aVal = (a.recipient_organization?.name || "").toLowerCase();
          bVal = (b.recipient_organization?.name || "").toLowerCase();
          break;
        case "location":
          aVal = `${a.recipient_organization?.city || ""} ${a.recipient_organization?.state || ""}`.toLowerCase();
          bVal = `${b.recipient_organization?.city || ""} ${b.recipient_organization?.state || ""}`.toLowerCase();
          break;
        case "amount":
          aVal = Number(a.amount);
          bVal = Number(b.amount);
          break;
        case "awardDate":
          aVal = a.award_date || "";
          bVal = b.award_date || "";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [subawards, sortField, sortOrder]);

  const exportToCSV = () => {
    if (!sortedSubawards.length) return;

    const headers = ["Recipient Organization", "Location", "Amount", "Description", "Award Date"];
    const rows = sortedSubawards.map(subaward => [
      subaward.recipient_organization?.name || "Unknown",
      `${subaward.recipient_organization?.city ? subaward.recipient_organization.city + ", " : ""}${subaward.recipient_organization?.state || "N/A"}`,
      Number(subaward.amount),
      subaward.description || "—",
      subaward.award_date ? new Date(subaward.award_date).toLocaleDateString() : "—",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subawards-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = async () => {
    if (!sortedSubawards.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Subawards");

    // Add headers
    worksheet.columns = [
      { header: "Recipient Organization", key: "organization", width: 30 },
      { header: "Location", key: "location", width: 20 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Description", key: "description", width: 40 },
      { header: "Award Date", key: "awardDate", width: 15 },
    ];

    // Add rows
    sortedSubawards.forEach(subaward => {
      worksheet.addRow({
        organization: subaward.recipient_organization?.name || "Unknown",
        location: `${subaward.recipient_organization?.city ? subaward.recipient_organization.city + ", " : ""}${subaward.recipient_organization?.state || "N/A"}`,
        amount: Number(subaward.amount),
        description: subaward.description || "—",
        awardDate: subaward.award_date ? new Date(subaward.award_date).toLocaleDateString() : "—",
      });
    });

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subawards-${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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

  if (!sortedSubawards || sortedSubawards.length === 0) {
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
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold text-foreground">Subaward Recipients</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Agencies receiving funding distribution {state ? `in ${state}` : "across all states"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("organization")}
                  className="h-8 gap-1"
                >
                  Recipient Organization
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("location")}
                  className="h-8 gap-1"
                >
                  Location
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("amount")}
                  className="h-8 gap-1"
                >
                  Amount
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("awardDate")}
                  className="h-8 gap-1"
                >
                  Award Date
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSubawards.map((subaward) => (
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
        Showing {sortedSubawards.length} subaward recipient{sortedSubawards.length !== 1 ? "s" : ""}
      </div>
    </Card>
  );
}
