import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  PulseDiscoveryService,
  type DiscoveredGrant,
  type NIHProject,
  type NSFAward,
} from "@/lib/discoveryService";
import {
  VERTICAL_MAPPINGS,
  getAlnPrefixesForVerticals,
} from "@/lib/verticalMappings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  Loader2,
  X,
} from "lucide-react";
import { format } from "date-fns";

const VERTICAL_OPTIONS = Object.keys(VERTICAL_MAPPINGS);

export function MoneyTrailDiscovery() {
  const [startDate, setStartDate] = useState(
    format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedVertical, setSelectedVertical] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredGrant[]>([]);
  const [trackingAln, setTrackingAln] = useState<string | null>(null);
  const [nihResults, setNihResults] = useState<NIHProject[]>([]);
  const [nsfResults, setNsfResults] = useState<NSFAward[]>([]);
  const [activeTrail, setActiveTrail] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDiscover = async () => {
    setLoading(true);
    setResults([]);
    setActiveTrail(null);
    try {
      const prefixes =
        selectedVertical !== "all"
          ? getAlnPrefixesForVerticals([selectedVertical])
          : undefined;
      const data = await PulseDiscoveryService.discoverNewALNs(
        startDate,
        endDate,
        prefixes
      );
      setResults(data);
      if (data.length === 0) {
        toast({
          title: "No Results",
          description: "No grant opportunities found for this search.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Discovery Failed",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTrackMoney = async (aln: string) => {
    if (aln === "N/A" || !aln) {
      toast({
        variant: "destructive",
        title: "No ALN",
        description: "This opportunity doesn't have an ALN number to track.",
      });
      return;
    }
    setTrackingAln(aln);
    setActiveTrail(aln);
    setNihResults([]);
    setNsfResults([]);

    try {
      const [nih, nsf] = await Promise.all([
        PulseDiscoveryService.trackNIH(aln),
        PulseDiscoveryService.trackNSF(aln),
      ]);
      setNihResults(nih);
      setNsfResults(nsf);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Tracking Failed",
        description: err.message,
      });
    } finally {
      setTrackingAln(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Discover New Grant Opportunities (SAM.gov)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Vertical
              </label>
              <Select
                value={selectedVertical}
                onValueChange={setSelectedVertical}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All Verticals" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verticals</SelectItem>
                  {VERTICAL_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleDiscover}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? "Searching..." : "Hunt for Grants"}
            </Button>
          </div>
          {selectedVertical !== "all" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Filtering ALN prefixes:
              </span>
              {getAlnPrefixesForVerticals([selectedVertical]).map((p) => (
                <Badge key={p} variant="outline" className="text-xs">
                  {p}.xxx
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setSelectedVertical("all")}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovery Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {results.length} Grant Opportunities Found
              {selectedVertical !== "all" && (
                <Badge variant="secondary" className="ml-2">
                  {selectedVertical}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ALN</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((grant, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="secondary">{grant.aln}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-medium">
                      {grant.title}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {grant.agency}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {grant.postedDate
                        ? format(new Date(grant.postedDate), "MM/dd/yyyy")
                        : ""}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {grant.link && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={grant.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTrackMoney(grant.aln)}
                        disabled={trackingAln === grant.aln}
                        className="gap-1"
                      >
                        {trackingAln === grant.aln ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "💰"
                        )}
                        Track Money
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Money Trail Results */}
      {activeTrail && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* NIH Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" />
                NIH Research Trail (ALN: {activeTrail})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trackingAln ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : nihResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No NIH projects found for this ALN.
                </p>
              ) : (
                <div className="space-y-3">
                  {nihResults.slice(0, 5).map((proj, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1">
                      <p className="font-medium text-sm">
                        {proj.project_title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PI: {proj.contact_pi_name} •{" "}
                        {proj.organization?.org_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proj.organization?.org_city},{" "}
                        {proj.organization?.org_state} • FY{proj.fiscal_year} •{" "}
                        {proj.award_amount
                          ? `$${proj.award_amount.toLocaleString()}`
                          : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* NSF Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4" />
                NSF Award Trail (ALN: {activeTrail})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trackingAln ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : nsfResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No NSF awards found for this ALN.
                </p>
              ) : (
                <div className="space-y-3">
                  {nsfResults.slice(0, 5).map((award, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1">
                      <p className="font-medium text-sm">
                        {award.title || award.awardeeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {award.awardeeName} •{" "}
                        {award.fundsObligatedAmt
                          ? `$${Number(
                              award.fundsObligatedAmt
                            ).toLocaleString()}`
                          : "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {award.startDate} → {award.expDate}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
