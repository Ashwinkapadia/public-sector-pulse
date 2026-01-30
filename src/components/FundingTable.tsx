import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { ArrowUpDown, Download, ExternalLink, Search } from "lucide-react";
import ExcelJS from "exceljs";
import { useToast } from "@/hooks/use-toast";
import { PushToClayButton } from "@/components/PushToClayButton";


interface FundingTableProps {
  state?: string;
  verticalIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

type SortField = "organization" | "vertical" | "funding" | "status" | "lastUpdated" | "source";
type SortOrder = "asc" | "desc";

export function FundingTable({ state, verticalIds, startDate, endDate }: FundingTableProps) {
  const { data: fundingRecords, isLoading } = useFundingRecords(state, startDate, endDate);
  const { data: assignments } = useRepAssignments();
  const [sortField, setSortField] = useState<SortField>("funding");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const navigate = useNavigate();
  const { toast } = useToast();

  const assignmentMap = useMemo(() => {
    if (!assignments) return new Map();
    return new Map(assignments.map(a => [a.organization_id, a]));
  }, [assignments]);

  // Filter by verticals
  const filteredByVerticals = useMemo(() => {
    if (!fundingRecords) return [];
    if (!verticalIds || verticalIds.length === 0) return fundingRecords;
    return fundingRecords.filter(record => verticalIds.includes(record.vertical_id));
  }, [fundingRecords, verticalIds]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedRecords = useMemo(() => {
    if (!filteredByVerticals) return [];
    
    const sorted = [...filteredByVerticals].sort((a, b) => {
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
        case "source":
          aVal = ((a as any).source || "USAspending").toLowerCase();
          bVal = ((b as any).source || "USAspending").toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredByVerticals, sortField, sortOrder]);

  const handleFindSubAwards = () => {
    if (!sortedRecords.length) {
      toast({
        variant: "destructive",
        title: "No results",
        description: "There are no funding records to search sub-awards for.",
      });
      return;
    }

    // Extract unique CFDA codes from all displayed records
    const allCfdaCodes = sortedRecords
      .map(record => record.cfda_code || record.grant_types?.cfda_code)
      .filter((code): code is string => !!code && code.trim() !== "");
    
    const uniqueCfdaCodes = [...new Set(allCfdaCodes)];

    if (uniqueCfdaCodes.length === 0) {
      toast({
        variant: "destructive",
        title: "No CFDA codes",
        description: "No CFDA codes found in the current results.",
      });
      return;
    }

    // Include all unique CFDA codes (no limit)
    const cfdaList = uniqueCfdaCodes.join(",");

    navigate(`/sub-awards?cfda_list=${encodeURIComponent(cfdaList)}`);
  };

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

  const exportToExcel = async () => {
    if (!sortedRecords.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Funding Records");

    // Add headers
    worksheet.columns = [
      { header: "Organization", key: "organization", width: 30 },
      { header: "Vertical", key: "vertical", width: 20 },
      { header: "Funding", key: "funding", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Last Updated", key: "lastUpdated", width: 15 },
    ];

    // Add rows
    sortedRecords.forEach(record => {
      worksheet.addRow({
        organization: record.organizations.name,
        vertical: record.verticals.name,
        funding: Number(record.amount),
        status: record.status,
        lastUpdated: record.organizations.last_updated || "N/A",
      });
    });

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funding-records-${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
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
            Funding Records
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Each row represents a unique grant. Organizations may appear multiple times if they received multiple grants.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleFindSubAwards} size="sm" className="gap-2">
            <Search className="h-4 w-4" />
            Find Sub-Awards for these Results
          </Button>
          <PushToClayButton
            dataType="funding_records"
            records={sortedRecords.map(record => ({
              id: record.id,
              organization_name: record.organizations.name,
              organization_id: record.organization_id,
              vertical: record.verticals.name,
              cfda_code: record.cfda_code || record.grant_types?.cfda_code || null,
              grant_type: record.grant_types?.name || null,
              amount: Number(record.amount),
              status: record.status,
              last_updated: record.organizations.last_updated || null,
              source: (record as any).source || "USAspending",
            }))}
          />
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
              <TableHead>CFDA Code</TableHead>
              <TableHead>Grant Type</TableHead>
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
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("source")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Source
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
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
                      {record.cfda_code || record.grant_types?.cfda_code || (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
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
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
