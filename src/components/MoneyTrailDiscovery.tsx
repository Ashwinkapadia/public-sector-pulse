import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  PulseDiscoveryService,
  type DiscoveredGrant,
  type GrantsGovOpportunity,
  type PrimeAward,
  type SubAward,
} from "@/lib/discoveryService";
import {
  VERTICAL_MAPPINGS,
  getAlnPrefixesForVerticals,
} from "@/lib/verticalMappings";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, ExternalLink, Loader2, X, ArrowRight, Building2, Landmark, Users,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const VERTICAL_OPTIONS = Object.keys(VERTICAL_MAPPINGS);

interface TrailData {
  aln: string;
  grantsGov: GrantsGovOpportunity[];
  prime: { results: PrimeAward[]; totalCount: number };
  sub: { results: SubAward[]; totalCount: number };
}

interface DiscoverResult {
  results: DiscoveredGrant[];
  totalBeforeFilter?: number;
}

export function MoneyTrailDiscovery() {
  const [startDate, setStartDate] = useState(
    format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedVertical, setSelectedVertical] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredGrant[]>([]);
  const [totalBeforeFilter, setTotalBeforeFilter] = useState<number | null>(null);
  const [trackingAln, setTrackingAln] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailData | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleDiscover = async () => {
    setLoading(true);
    setResults([]);
    setTotalBeforeFilter(null);
    setTrail(null);
    try {
      const prefixes =
        selectedVertical !== "all"
          ? getAlnPrefixesForVerticals([selectedVertical])
          : undefined;
      const data = await PulseDiscoveryService.discoverNewALNs(startDate, endDate, prefixes);
      setResults(data.results);
      setTotalBeforeFilter(data.totalBeforeFilter ?? null);
      if (data.results.length === 0) {
        const filterMsg = data.totalBeforeFilter && data.totalBeforeFilter > 0
          ? `${data.totalBeforeFilter} total listings were found, but none matched the "${selectedVertical}" vertical filter. Try "All Verticals".`
          : "No grant opportunities found for this search.";
        toast({ title: "No Results", description: filterMsg });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Discovery Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTrackMoney = async (aln: string) => {
    if (aln === "N/A" || !aln) {
      toast({ variant: "destructive", title: "No ALN", description: "This opportunity doesn't have an ALN number to track." });
      return;
    }
    setTrackingAln(aln);
    setTrail(null);

    try {
      const [grantsGov, prime, sub] = await Promise.all([
        PulseDiscoveryService.trackGrantsGov(aln),
        PulseDiscoveryService.trackPrimeAwards(aln, startDate, endDate),
        PulseDiscoveryService.trackSubAwards(aln, startDate, endDate),
      ]);
      setTrail({ aln, grantsGov, prime, sub });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Tracking Failed", description: err.message });
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
            Money Trail Discovery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Vertical</label>
              <Select value={selectedVertical} onValueChange={setSelectedVertical}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All Verticals" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verticals</SelectItem>
                  {VERTICAL_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleDiscover} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Searching..." : "Hunt for Grants"}
            </Button>
          </div>
          {selectedVertical !== "all" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filtering ALN prefixes:</span>
              {getAlnPrefixesForVerticals([selectedVertical]).map((p) => (
                <Badge key={p} variant="outline" className="text-xs">{p}.xxx</Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setSelectedVertical("all")}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trail Steps Indicator */}
      {(results.length > 0 || trail) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Badge variant={results.length > 0 ? "default" : "outline"} className="gap-1">1. SAM.gov</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={trail?.grantsGov ? "default" : "outline"} className="gap-1">2. Grants.gov</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={trail?.prime ? "default" : "outline"} className="gap-1">3. Prime Awards</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={trail?.sub ? "default" : "outline"} className="gap-1">4. Sub-Awards</Badge>
        </div>
      )}

      {/* Step 1: SAM.gov Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4" />
              Step 1: SAM.gov — Program Authorization ({results.length} found)
              {selectedVertical !== "all" && <Badge variant="secondary" className="ml-2">{selectedVertical}</Badge>}
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
                  <TableRow key={i} className={trail?.aln === grant.aln ? "bg-muted/50" : ""}>
                    <TableCell><Badge variant="secondary">{grant.aln}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate font-medium">{grant.title}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{grant.agency}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {grant.postedDate ? format(new Date(grant.postedDate), "MM/dd/yyyy") : ""}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {grant.link && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={grant.link} target="_blank" rel="noopener noreferrer">
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
                        {trackingAln === grant.aln ? <Loader2 className="h-3 w-3 animate-spin" /> : "💰"}
                        Follow the Money
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Loading indicator for trail */}
      {trackingAln && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Following the money trail for ALN {trackingAln}...</span>
          </CardContent>
        </Card>
      )}

      {/* Trail Results */}
      {trail && !trackingAln && (
        <div className="space-y-6">
          {/* Step 2: Grants.gov */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Step 2: Grants.gov — Open Opportunities (ALN: {trail.aln})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trail.grantsGov.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open or forecasted opportunities found on Grants.gov for this ALN.</p>
              ) : (
                <div className="space-y-3">
                  {trail.grantsGov.slice(0, 5).map((opp, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{opp.title || opp.number}</p>
                        {opp.link && (
                          <Button variant="ghost" size="sm" asChild className="shrink-0">
                            <a href={opp.link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {opp.agency} • {opp.number}
                      </p>
                      <div className="flex gap-2 text-xs">
                        <Badge variant={opp.status === "posted" ? "default" : "secondary"} className="text-xs">
                          {opp.status}
                        </Badge>
                        {opp.openDate && <span className="text-muted-foreground">Opens: {opp.openDate}</span>}
                        {opp.closeDate && <span className="text-muted-foreground">Closes: {opp.closeDate}</span>}
                      </div>
                    </div>
                  ))}
                  {trail.grantsGov.length > 5 && (
                    <p className="text-xs text-muted-foreground">+ {trail.grantsGov.length - 5} more opportunities</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Prime Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Step 3: USAspending Prime Awards (ALN: {trail.aln})
                {trail.prime.totalCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">{trail.prime.totalCount} total</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trail.prime.results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No prime awards found for this ALN.</p>
              ) : (
                <div className="space-y-3">
                  {trail.prime.results.slice(0, 5).map((award, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1">
                      <p className="font-medium text-sm">{award.recipientName}</p>
                      <p className="text-xs text-muted-foreground">
                        Award: {award.awardId} • {award.agency}
                        {award.subAgency ? ` / ${award.subAgency}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {award.amount ? `$${Number(award.amount).toLocaleString()}` : "N/A"}
                        {award.startDate ? ` • ${award.startDate}` : ""}
                        {award.endDate ? ` → ${award.endDate}` : ""}
                      </p>
                    </div>
                  ))}
                  {trail.prime.totalCount > 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => navigate(`/?source=USAspending`)}
                    >
                      View all {trail.prime.totalCount} prime awards <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 4: Sub-Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Step 4: USAspending Sub-Awards (ALN: {trail.aln})
                {trail.sub.totalCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">{trail.sub.totalCount} total</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trail.sub.results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sub-awards found for this ALN.</p>
              ) : (
                <div className="space-y-3">
                  {trail.sub.results.slice(0, 5).map((sub, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1">
                      <p className="font-medium text-sm">{sub.subAwardeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        Sub-Award: {sub.subAwardId} • Prime: {sub.primeRecipientName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sub.amount ? `$${Number(sub.amount).toLocaleString()}` : "N/A"}
                        {sub.date ? ` • ${sub.date}` : ""}
                      </p>
                      {sub.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-lg">{sub.description}</p>
                      )}
                    </div>
                  ))}
                  {trail.sub.totalCount > 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => navigate(`/sub-awards?aln_list=${trail.aln}`)}
                    >
                      View all {trail.sub.totalCount} sub-awards <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
