import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { DiscoveredGrant, PrimeAward, SubAward } from "@/lib/discoveryService";
import ExcelJS from "exceljs";

interface TrailData {
  aln: string;
  prime: { results: PrimeAward[]; totalCount: number };
  sub: { results: SubAward[]; totalCount: number };
}

interface MoneyTrailExportProps {
  results: DiscoveredGrant[];
  trail: TrailData | null;
}

export function MoneyTrailExport({ results, trail }: MoneyTrailExportProps) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const hasData = results.length > 0 || trail;
  if (!hasData) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();

      // Sheet 1: Grants.gov
      if (results.length > 0) {
        const ws = wb.addWorksheet("Grants.gov Opportunities");
        ws.columns = [
          { header: "ALN", key: "aln", width: 12 },
          { header: "Title", key: "title", width: 50 },
          { header: "Agency", key: "agency", width: 35 },
          { header: "Type", key: "type", width: 15 },
          { header: "Posted Date", key: "postedDate", width: 14 },
          { header: "Close Date", key: "closeDate", width: 14 },
          { header: "Link", key: "link", width: 40 },
          { header: "Vertical Match", key: "verticalMatch", width: 14 },
        ];
        results.forEach((g) =>
          ws.addRow({
            aln: g.aln,
            title: g.title,
            agency: g.agency,
            type: g.type,
            postedDate: g.postedDate,
            closeDate: g.closeDate,
            link: g.link,
            verticalMatch: g.verticalMatch ? "Yes" : "No",
          })
        );
        styleHeader(ws);
      }

      // Sheet 2: Prime Awards
      if (trail?.prime?.results?.length) {
        const ws = wb.addWorksheet("Prime Awards");
        ws.columns = [
          { header: "Award ID", key: "awardId", width: 20 },
          { header: "Recipient", key: "recipientName", width: 40 },
          { header: "Amount", key: "amount", width: 18 },
          { header: "Agency", key: "agency", width: 30 },
          { header: "Sub-Agency", key: "subAgency", width: 30 },
          { header: "Start Date", key: "startDate", width: 14 },
          { header: "End Date", key: "endDate", width: 14 },
          { header: "Description", key: "description", width: 50 },
        ];
        trail.prime.results.forEach((a) => {
          const row = ws.addRow({ ...a });
          const amountCell = row.getCell("amount");
          amountCell.numFmt = "$#,##0.00";
        });
        styleHeader(ws);
      }

      // Sheet 3: Sub-Awards
      if (trail?.sub?.results?.length) {
        const ws = wb.addWorksheet("Sub-Awards");
        ws.columns = [
          { header: "Sub-Award ID", key: "subAwardId", width: 20 },
          { header: "Sub-Awardee", key: "subAwardeeName", width: 40 },
          { header: "Amount", key: "amount", width: 18 },
          { header: "Prime Award ID", key: "primeAwardId", width: 20 },
          { header: "Prime Recipient", key: "primeRecipientName", width: 35 },
          { header: "Date", key: "date", width: 14 },
          { header: "Description", key: "description", width: 50 },
        ];
        trail.sub.results.forEach((s) => {
          const row = ws.addRow({ ...s });
          const amountCell = row.getCell("amount");
          amountCell.numFmt = "$#,##0.00";
        });
        styleHeader(ws);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const alnLabel = trail?.aln ? `_ALN_${trail.aln}` : "";
      a.download = `MoneyTrail${alnLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Export Complete", description: "Money Trail data downloaded as Excel." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-2">
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export to Excel
    </Button>
  );
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
}
