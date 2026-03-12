import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  PulseDiscoveryService,
  type DiscoveredGrant,
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
  Search, ExternalLink, Loader2, X, ArrowRight, Building2, Users,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const VERTICAL_OPTIONS = Object.keys(VERTICAL_MAPPINGS);

interface TrailData {
  aln: string;
  prime: { results: PrimeAward[]; totalCount: number };
  sub: { results: SubAward[]; totalCount: number };
}

export function MoneyTrailDiscovery() {
  const [startDate, setStartDate] = useState(
    format(new Date(Date.now() - 180 * 86400000), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedVertical, setSelectedVertical] = useState<string>("all");
  const [alnInput, setAlnInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredGrant[]>([]);
  const [trackingAln, setTrackingAln] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailData | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleDiscover = async () => {
    setLoading(true);
    setResults([]);
    setTrail(null);

    const trimmedAln = alnInput.trim();

    // If ALN is provided, skip Grants.gov and go straight to money trail
    if (trimmedAln) {
      try {
        setTrackingAln(trimmedAln);
        const [prime, sub] = await Promise.all([
          PulseDiscoveryService.trackPrimeAwards(trimmedAln, startDate, endDate),
          PulseDiscoveryService.trackSubAwards(trimmedAln, startDate, endDate),
        ]);
        setTrail({ aln: trimmedAln, prime, sub });
        if (prime.results.length === 0 && sub.results.length === 0) {
          toast({ title: "No Results", description: `No prime or sub-awards found for ALN ${trimmedAln}.` });
        }
      } catch (err: any) {
        toast({ variant: "destructive", title: "Tracking Failed", description: err.message });
      } finally {
        setTrackingAln(null);
        setLoading(false);
      }
      return;
    }

    try {
      const prefixes =
        selectedVertical !== "all"
          ? getAlnPrefixesForVerticals([selectedVertical])
          : undefined;
      const data = await PulseDiscoveryService.discoverNewALNs(startDate, endDate, prefixes);
      setResults(data.results);
      if (data.results.length === 0) {
        toast({ title: "No Results", description: "No grant opportunities found for this date range." });
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
      const [prime, sub] = await Promise.all([
        PulseDiscoveryService.trackPrimeAwards(aln, startDate, endDate),
        PulseDiscoveryService.trackSubAwards(aln, startDate, endDate),
      ]);
      setTrail({ aln, prime, sub });
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
              <label className="text-sm font-medium mb-1 block">ALN Number <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                type="text"
                placeholder="e.g. 93.798"
                value={alnInput}
                onChange={(e) => setAlnInput(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Vertical</label>
              <Select value={selectedVertical} onValueChange={setSelectedVertical} disabled={!!alnInput.trim()}>
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
              {loading ? "Searching..." : alnInput.trim() ? "Follow the Money" : "Hunt for Grants"}
            </Button>
          </div>
          {alnInput.trim() && (
            <p className="mt-2 text-xs text-muted-foreground">
              💡 ALN provided — will skip Grants.gov and go directly to Prime & Sub-Award tracking.
            </p>
          )}
          {!alnInput.trim() && selectedVertical !== "all" && (
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
          <Badge variant={results.length > 0 ? "default" : "outline"} className="gap-1">1. Grants.gov</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={trail?.prime ? "default" : "outline"} className="gap-1">2. Prime Awards</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={trail?.sub ? "default" : "outline"} className="gap-1">3. Sub-Awards</Badge>
        </div>
      )}

      {/* Step 1: Grants.gov Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Step 1: Grants.gov — Open Opportunities ({results.length} found)
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
                  <TableHead>Status</TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((grant: any, i) => (
                  <TableRow key={i} className={trail?.aln === grant.aln ? "bg-muted/50" : grant.verticalMatch ? "bg-primary/5" : ""}>
                    <TableCell><Badge variant={grant.verticalMatch ? "default" : "secondary"}>{grant.aln}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate font-medium">{grant.title}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{grant.agency}</TableCell>
                    <TableCell>
                      <Badge variant={grant.status === "posted" ? "default" : "secondary"} className="text-xs">
                        {grant.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {grant.closeDate || "—"}
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
          {/* Step 2: Prime Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Step 2: USAspending Prime Awards (ALN: {trail.aln})
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
                  {trail.prime.results.map((award, i) => (
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Sub-Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Step 3: USAspending Sub-Awards (ALN: {trail.aln})
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
