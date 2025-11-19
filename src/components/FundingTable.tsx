import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { useFundingRecords } from "@/hooks/useFundingData";
import { useRepAssignments } from "@/hooks/useRepAssignments";
import { ArrowUpDown, Download, ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";
import { ProgramModelsDisplay } from "./ProgramModelsDisplay";

interface FundingTableProps {
  state?: string;
  grantTypeId?: string | null;
}

type SortField = "organization" | "vertical" | "funding" | "status" | "lastUpdated";
type SortOrder = "asc" | "desc";

export function FundingTable({ state, grantTypeId }: FundingTableProps) {
  const { data: fundingRecords, isLoading } = useFundingRecords(state);
  const { data: assignments } = useRepAssignments();
  const [sortField, setSortField] = useState<SortField>("funding");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const assignmentMap = useMemo(() => {
    if (!assignments) return new Map();
    return new Map(assignments.map(a => [a.organization_id, a]));
  }, [assignments]);

  // Filter by grant type
  const filteredByGrantType = useMemo(() => {
    if (!fundingRecords) return [];
    if (!grantTypeId) return fundingRecords;
    return fundingRecords.filter(record => record.grant_type_id === grantTypeId);
  }, [fundingRecords, grantTypeId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedRecords = useMemo(() => {
    if (!filteredByGrantType) return [];
    
    const sorted = [...filteredByGrantType].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "organization":
          aVal = a.organizations.name.toLowerCase();
          bVal = b.organizations.name.toLowerCase();
          break;
        case "vertical":
          aVal = a.verticals.name.toLowerCase();
          bVal = b.verticals.name.toLowerCase();
          break;
        case "funding":
          aVal = Number(a.amount);
          bVal = Number(b.amount);
          break;
        case "status":
          aVal = a.status.toLowerCase();
          bVal = b.status.toLowerCase();
          break;
        case "lastUpdated":
          aVal = a.organizations.last_updated || "";
          bVal = b.organizations.last_updated || "";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredByGrantType, sortField, sortOrder]);

  const exportToCSV = () => {
    if (!sortedRecords.length) return;

    const headers = ["Organization", "Vertical", "Funding", "Status", "Last Updated"];
    const rows = sortedRecords.map(record => [
      record.organizations.name,
      record.verticals.name,
      Number(record.amount),
      record.status,
      record.organizations.last_updated || "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funding-records-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    if (!sortedRecords.length) return;

    const data = sortedRecords.map(record => ({
      Organization: record.organizations.name,
      Vertical: record.verticals.name,
      Funding: Number(record.amount),
      Status: record.status,
      "Last Updated": record.organizations.last_updated || "N/A",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Funding Records");
    XLSX.writeFile(wb, `funding-records-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-foreground">
            Organizations Receiving Funding
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Key government agencies and departments with active funding
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={exportToExcel} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("organization")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Organization
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("vertical")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Vertical
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Grant Type</TableHead>
              <TableHead>Program Models</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("funding")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Funding
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("status")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Status
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("lastUpdated")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Last Updated
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRecords && sortedRecords.length > 0 ? (
              sortedRecords.map((record) => {
                const assignment = assignmentMap.get(record.organization_id);
                return (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {record.organizations.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{record.verticals.name}</Badge>
                    </TableCell>
                    <TableCell>
                      {record.grant_types ? (
                        <Badge variant="outline" className="text-xs">
                          {record.grant_types.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProgramModelsDisplay fundingRecordId={record.id} />
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
                    <TableCell>
                      <Badge variant="outline">
                        {(record as any).source || 'USAspending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link to={`/organization/${record.organization_id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
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
