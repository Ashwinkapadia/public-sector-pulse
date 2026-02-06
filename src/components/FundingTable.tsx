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
import { ArrowUpDown, Download, ExternalLink, Search, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ExcelJS from "exceljs";
import { useToast } from "@/hooks/use-toast";
import { PushToClayButton } from "@/components/PushToClayButton";


interface FundingTableProps {
  state?: string;
  verticalIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

type SortField = "organization" | "vertical" | "funding" | "status" | "awardDate" | "source";
type SortOrder = "asc" | "desc";

export function FundingTable({ state, verticalIds, startDate, endDate }: FundingTableProps) {
  // Now passes verticalIds to the hook so filtering happens server-side
  const { data: fundingRecords, isLoading } = useFundingRecords(state, startDate, endDate, verticalIds);
  const { data: assignments } = useRepAssignments();
  const [sortField, setSortField] = useState<SortField>("funding");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [showUniqueOrgs, setShowUniqueOrgs] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const assignmentMap = useMemo(() => {
    if (!assignments) return new Map();
    return new Map(assignments.map(a => [a.organization_id, a]));
  }, [assignments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedRecords = useMemo(() => {
    if (!fundingRecords) return [];
    
    const sorted = [...fundingRecords].sort((a, b) => {
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
        case "awardDate":
          aVal = a.action_date || a.date_range_start || "";
          bVal = b.action_date || b.date_range_start || "";
          break;
        case "source":
          aVal = (a.source || "USAspending").toLowerCase();
          bVal = (b.source || "USAspending").toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [fundingRecords, sortField, sortOrder]);

  // Deduplicate to show only one record per organization (highest funding)
  const displayRecords = useMemo(() => {
    if (!showUniqueOrgs) return sortedRecords;
    
    const orgMap = new Map<string, typeof sortedRecords[0]>();
    for (const record of sortedRecords) {
      const existing = orgMap.get(record.organization_id);
      if (!existing || Number(record.amount) > Number(existing.amount)) {
        orgMap.set(record.organization_id, record);
      }
    }
    return Array.from(orgMap.values()).sort((a, b) => Number(b.amount) - Number(a.amount));
  }, [sortedRecords, showUniqueOrgs]);

  const handleFindSubAwards = () => {
    if (!displayRecords.length) {
      toast({
        variant: "destructive",
        title: "No results",
        description: "There are no funding records to search sub-awards for.",
      });
      return;
    }

    // Extract unique ALN codes from all displayed records
    const allAlnCodes = displayRecords
      .map(record => record.cfda_code || record.grant_types?.cfda_code)
      .filter((code): code is string => !!code && code.trim() !== "");
    
    const uniqueAlnCodes = [...new Set(allAlnCodes)];

    if (uniqueAlnCodes.length === 0) {
      toast({
        variant: "destructive",
        title: "No ALN codes",
        description: "No ALN codes found in the current results.",
      });
      return;
    }

    // Include all unique ALN codes (no limit)
    const alnList = uniqueAlnCodes.join(",");

    navigate(`/sub-awards?aln_list=${encodeURIComponent(alnList)}`);
  };

  const exportToCSV = () => {
    if (!displayRecords.length) return;

    const headers = ["Organization", "Vertical", "Funding", "Status", "Award Date", "Source"];
    const rows = displayRecords.map(record => [
      record.organizations.name,
      record.verticals.name,
      Number(record.amount),
      record.status,
      record.action_date || record.date_range_start || "N/A",
      record.source || "USAspending",
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
    if (!displayRecords.length) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Funding Records");

    // Add headers
    worksheet.columns = [
      { header: "Organization", key: "organization", width: 30 },
      { header: "Vertical", key: "vertical", width: 20 },
      { header: "Funding", key: "funding", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Award Date", key: "awardDate", width: 15 },
      { header: "Source", key: "source", width: 15 },
    ];

    // Add rows
    displayRecords.forEach(record => {
      worksheet.addRow({
        organization: record.organizations.name,
        vertical: record.verticals.name,
        funding: Number(record.amount),
        status: record.status,
        awardDate: record.action_date || record.date_range_start || "N/A",
        source: record.source || "USAspending",
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
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-foreground">
              Funding Records
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {showUniqueOrgs 
                ? "Showing one record per organization (highest funding amount)."
                : "Each row represents a unique grant. Organizations may appear multiple times if they received multiple grants."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="unique-orgs"
                checked={showUniqueOrgs}
                onCheckedChange={setShowUniqueOrgs}
              />
              <Label htmlFor="unique-orgs" className="text-sm cursor-pointer flex items-center gap-1">
                <Users className="h-4 w-4" />
                Unique Orgs Only
              </Label>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleFindSubAwards} size="sm" className="gap-2">
            <Search className="h-4 w-4" />
            Find Sub-Awards for these Results
          </Button>
          <PushToClayButton
            dataType="funding_records"
            records={displayRecords.map(record => ({
              id: record.id,
              organization_name: record.organizations.name,
              organization_id: record.organization_id,
              vertical: record.verticals.name,
              cfda_code: record.cfda_code || record.grant_types?.cfda_code || null,
              grant_type: record.grant_types?.name || null,
              amount: Number(record.amount),
              status: record.status,
              award_date: record.action_date || record.date_range_start || null,
              source: record.source || "USAspending",
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
              <TableHead>ALN Code</TableHead>
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
                  onClick={() => handleSort("awardDate")}
                  className="flex items-center gap-1 hover:bg-transparent"
                >
                  Award Date
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
            {displayRecords && displayRecords.length > 0 ? (
              displayRecords.map((record) => {
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
                      {record.action_date || record.date_range_start || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {record.source || 'USAspending'}
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
