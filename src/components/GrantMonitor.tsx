import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  PulseDiscoveryService,
  type DiscoveredGrant,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Search, Loader2, Send, Calendar, Clock, Trash2, Play, Pause, ExternalLink, Download,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const VERTICAL_OPTIONS = Object.keys(VERTICAL_MAPPINGS);
const GRANT_MONITOR_STORAGE_KEY = "grant_monitor_state";

interface Schedule {
  id: string;
  name: string;
  frequency: string;
  vertical_ids: string[];
  email_address: string;
  lookback_months: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

interface MonitorRun {
  id: string;
  schedule_id: string | null;
  status: string;
  grants_found: number;
  unique_alns: string[];
  prime_awards_found: number;
  sub_awards_found: number;
  csv_url: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface GrantMonitorProps {
  onSwitchTab?: (tab: string) => void;
}

export function GrantMonitor({ onSwitchTab }: GrantMonitorProps) {
  // Search filters
  const [startDate, setStartDate] = useState(() => {
    if (typeof window === "undefined") return format(subDays(new Date(), 180), "yyyy-MM-dd");
    const saved = localStorage.getItem(GRANT_MONITOR_STORAGE_KEY);
    if (!saved) return format(subDays(new Date(), 180), "yyyy-MM-dd");

    try {
      const parsed = JSON.parse(saved) as { startDate?: string };
      return parsed.startDate || format(subDays(new Date(), 180), "yyyy-MM-dd");
    } catch {
      return format(subDays(new Date(), 180), "yyyy-MM-dd");
    }
  });
  const [endDate, setEndDate] = useState(() => {
    if (typeof window === "undefined") return format(new Date(), "yyyy-MM-dd");
    const saved = localStorage.getItem(GRANT_MONITOR_STORAGE_KEY);
    if (!saved) return format(new Date(), "yyyy-MM-dd");

    try {
      const parsed = JSON.parse(saved) as { endDate?: string };
      return parsed.endDate || format(new Date(), "yyyy-MM-dd");
    } catch {
      return format(new Date(), "yyyy-MM-dd");
    }
  });
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(GRANT_MONITOR_STORAGE_KEY);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved) as { selectedVerticals?: string[] };
      return Array.isArray(parsed.selectedVerticals) ? parsed.selectedVerticals : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredGrant[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(GRANT_MONITOR_STORAGE_KEY);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved) as { results?: DiscoveredGrant[] };
      return Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      return [];
    }
  });

  // ALN selection for export
  const [selectedAlns, setSelectedAlns] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const saved = localStorage.getItem(GRANT_MONITOR_STORAGE_KEY);
    if (!saved) return new Set();

    try {
      const parsed = JSON.parse(saved) as { selectedAlns?: string[] };
      return new Set(Array.isArray(parsed.selectedAlns) ? parsed.selectedAlns : []);
    } catch {
      return new Set();
    }
  });

  // Schedule dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState("daily");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleLookback, setScheduleLookback] = useState(3);
  const [scheduleVerticals, setScheduleVerticals] = useState<string[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    localStorage.setItem(
      GRANT_MONITOR_STORAGE_KEY,
      JSON.stringify({
        startDate,
        endDate,
        selectedVerticals,
        results,
        selectedAlns: Array.from(selectedAlns),
      })
    );
  }, [startDate, endDate, selectedVerticals, results, selectedAlns]);

  // Extract unique ALNs from results
  const uniqueAlns = Array.from(
    new Set(results.map((g) => g.aln).filter((a) => a && a.trim()))
  ).sort();

  // Group ALNs by vertical
  const alnsByVertical: Record<string, string[]> = {};
  for (const grant of results) {
    if (!grant.aln) continue;
    const prefix = grant.aln.includes(".") ? grant.aln.split(".")[0] : grant.aln.slice(0, 2);
    for (const [vertical, prefixes] of Object.entries(VERTICAL_MAPPINGS)) {
      if (prefixes.includes(prefix)) {
        if (!alnsByVertical[vertical]) alnsByVertical[vertical] = [];
        if (!alnsByVertical[vertical].includes(grant.aln)) {
          alnsByVertical[vertical].push(grant.aln);
        }
      }
    }
  }

  // Fetch schedules
  const { data: schedules, isLoading: loadingSchedules } = useQuery({
    queryKey: ["grant_monitor_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grant_monitor_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Schedule[];
    },
  });

  // Fetch recent runs
  const { data: recentRuns } = useQuery({
    queryKey: ["grant_monitor_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grant_monitor_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as MonitorRun[];
    },
  });

  // Clear results manually
  const clearResults = () => {
    setResults([]);
    setSelectedAlns(new Set());
    localStorage.setItem(
      GRANT_MONITOR_STORAGE_KEY,
      JSON.stringify({
        startDate,
        endDate,
        selectedVerticals,
        results: [],
        selectedAlns: [],
      })
    );
  };

  // Search Grants.gov
  const handleSearch = async () => {
    setLoading(true);
    try {
      const alnPrefixes =
        selectedVerticals.length > 0
          ? getAlnPrefixesForVerticals(selectedVerticals)
          : undefined;

      const data = await PulseDiscoveryService.discoverNewALNs(
        startDate,
        endDate,
        alnPrefixes
      );

      setResults(data.results || []);
      setSelectedAlns(new Set());
      toast({
        title: "Search Complete",
        description: `Found ${data.results?.length || 0} grants (${new Set(data.results?.map((r) => r.aln).filter(Boolean)).size} unique ALNs)`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Toggle ALN selection
  const toggleAln = (aln: string) => {
    setSelectedAlns((prev) => {
      const next = new Set(prev);
      if (next.has(aln)) next.delete(aln);
      else next.add(aln);
      return next;
    });
  };

  const selectAllAlns = () => setSelectedAlns(new Set(uniqueAlns));
  const deselectAllAlns = () => setSelectedAlns(new Set());

  const selectVerticalAlns = (vertical: string) => {
    const alns = alnsByVertical[vertical] || [];
    setSelectedAlns((prev) => {
      const next = new Set(prev);
      for (const a of alns) next.add(a);
      return next;
    });
  };

  // Export to Prime Awards Dashboard (sets ALN filter in localStorage & navigates)
  const exportToPrimeAwards = () => {
    if (selectedAlns.size === 0) {
      toast({ variant: "destructive", title: "No ALNs selected", description: "Select at least one ALN to export" });
      return;
    }
    const alnString = Array.from(selectedAlns).join(",");
    localStorage.setItem("dashboard_aln", alnString);
    const threeMonthsAgo = subDays(new Date(), 90);
    localStorage.setItem("dashboard_startDate", threeMonthsAgo.toISOString());
    localStorage.setItem("dashboard_endDate", new Date().toISOString());
    localStorage.removeItem("dashboard_hasAppliedSearch");
    localStorage.setItem("dashboard_autoFetch", "true");
    toast({
      title: "ALNs Exported",
      description: `${selectedAlns.size} ALN(s) sent to Prime Awards Dashboard. Auto-fetching from USAspending...`,
    });
    onSwitchTab?.("dashboard");
  };

  // Export to Money Trail Discovery (sets ALN in component - uses navigate)
  const exportToMoneyTrail = () => {
    if (selectedAlns.size === 0) {
      toast({ variant: "destructive", title: "No ALNs selected", description: "Select at least one ALN to export" });
      return;
    }
    const alnString = Array.from(selectedAlns).join(",");
    localStorage.setItem("moneytrail_aln", alnString);
    toast({
      title: "ALNs Exported",
      description: `${selectedAlns.size} ALN(s) sent to Money Trail Discovery. Switching now...`,
    });
    onSwitchTab?.("money-trail");
  };

  // Create schedule
  const createSchedule = async () => {
    if (!scheduleName.trim() || !scheduleEmail.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name and email are required" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Not authenticated" });
      return;
    }

    const now = new Date();
    let nextRun: Date;
    if (scheduleFrequency === "daily") nextRun = new Date(now.getTime() + 86400000);
    else if (scheduleFrequency === "weekly") nextRun = new Date(now.getTime() + 7 * 86400000);
    else nextRun = new Date(now.getTime() + 30 * 86400000);

    const { error } = await supabase.from("grant_monitor_schedules").insert({
      user_id: user.id,
      name: scheduleName,
      frequency: scheduleFrequency,
      vertical_ids: scheduleVerticals,
      email_address: scheduleEmail,
      lookback_months: scheduleLookback,
      is_active: true,
      next_run_at: nextRun.toISOString(),
    });

    if (error) {
      toast({ variant: "destructive", title: "Failed to create schedule", description: error.message });
      return;
    }

    toast({ title: "Schedule Created", description: `"${scheduleName}" will run ${scheduleFrequency}` });
    setScheduleDialogOpen(false);
    setScheduleName("");
    setScheduleEmail("");
    setScheduleVerticals([]);
    queryClient.invalidateQueries({ queryKey: ["grant_monitor_schedules"] });
  };

  // Toggle schedule active/inactive
  const toggleScheduleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("grant_monitor_schedules")
      .update({ is_active: !currentActive })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Failed to update schedule" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["grant_monitor_schedules"] });
  };

  // Delete schedule
  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from("grant_monitor_schedules").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Failed to delete schedule" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["grant_monitor_schedules"] });
    toast({ title: "Schedule deleted" });
  };

  // Run pipeline manually
  const runPipelineManually = async (scheduleId?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const body: any = { action: "run_pipeline" };
      if (scheduleId) body.scheduleId = scheduleId;
      else {
        // Manual run with current selections - use same date range as the search
        body.alns = Array.from(selectedAlns);
        body.startDate = startDate;
        body.endDate = endDate;
      }

      const { data, error } = await supabase.functions.invoke("grant-monitor-pipeline", {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      toast({
        title: "Pipeline Started",
        description: "The grant monitoring pipeline is running. You'll receive an email when complete.",
      });
      queryClient.invalidateQueries({ queryKey: ["grant_monitor_runs"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Pipeline Failed", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search New Grants on Grants.gov
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Vertical Filter */}
          <div>
            <Label className="mb-2 block">Filter by Verticals (optional)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {VERTICAL_OPTIONS.map((v) => (
                <div key={v} className="flex items-center space-x-2">
                  <Checkbox
                    id={`gm-vert-${v}`}
                    checked={selectedVerticals.includes(v)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedVerticals([...selectedVerticals, v]);
                      else setSelectedVerticals(selectedVerticals.filter((sv) => sv !== v));
                    }}
                  />
                  <Label htmlFor={`gm-vert-${v}`} className="text-sm cursor-pointer">
                    {v}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSearch} disabled={loading} className="gap-2" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Searching Grants.gov..." : "Search for New Grants"}
          </Button>
        </CardContent>
      </Card>

      {/* Results Section */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Found {results.length} Grants ({uniqueAlns.length} unique ALN/CFDA numbers)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllAlns}>
                  Select All ALNs
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllAlns}>
                  Deselect All
                </Button>
                <Button variant="destructive" size="sm" onClick={clearResults} className="gap-1">
                  <Trash2 className="h-4 w-4" />
                  Clear Results
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Vertical Quick Select */}
            {Object.keys(alnsByVertical).length > 0 && (
              <div>
                <Label className="mb-2 block text-sm font-medium">Quick Select by Vertical</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(alnsByVertical).map(([vertical, alns]) => (
                    <Button
                      key={vertical}
                      variant="outline"
                      size="sm"
                      onClick={() => selectVerticalAlns(vertical)}
                      className="gap-1"
                    >
                      {vertical}
                      <Badge variant="secondary" className="ml-1">{alns.length}</Badge>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* ALN Selection Table */}
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Select</TableHead>
                    <TableHead>ALN/CFDA</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead>Close Date</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((grant, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Checkbox
                          checked={selectedAlns.has(grant.aln)}
                          onCheckedChange={() => toggleAln(grant.aln)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{grant.aln}</TableCell>
                      <TableCell className="max-w-[300px] truncate" title={grant.title}>
                        {grant.title}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">{grant.agency}</TableCell>
                      <TableCell className="text-sm">{grant.postedDate}</TableCell>
                      <TableCell className="text-sm">{grant.closeDate || "—"}</TableCell>
                      <TableCell>
                        {grant.link && (
                          <a href={grant.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Export Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <div className="text-sm text-muted-foreground self-center">
                {selectedAlns.size} ALN(s) selected
              </div>
              <Button
                onClick={() => {
                  const csvHeader = "ALN/CFDA,Title,Agency,Posted Date,Close Date,Link";
                  const csvRows = results.map((g) =>
                    `"${g.aln}","${(g.title || '').replace(/"/g, '""')}","${(g.agency || '').replace(/"/g, '""')}","${g.postedDate || ''}","${g.closeDate || ''}","${g.link || ''}"`
                  );
                  const csvContent = [csvHeader, ...csvRows].join("\n");
                  const blob = new Blob([csvContent], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `grants_gov_results_${format(new Date(), "yyyy-MM-dd")}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download All Results as CSV
              </Button>
              <Button
                onClick={exportToPrimeAwards}
                disabled={selectedAlns.size === 0}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Export to Prime Awards Dashboard
              </Button>
              <Button
                onClick={exportToMoneyTrail}
                disabled={selectedAlns.size === 0}
                variant="secondary"
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Export to Money Trail Discovery
              </Button>
              <Button
                onClick={() => runPipelineManually()}
                disabled={selectedAlns.size === 0}
                variant="outline"
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Run Full Pipeline (Prime + Sub + CSV)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduling Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Scheduled Searches
            </CardTitle>
            <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Create Schedule
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Automated Search Schedule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Schedule Name</Label>
                    <Input
                      placeholder="e.g. Daily HHS Grant Scan"
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Frequency</Label>
                    <Select value={scheduleFrequency} onValueChange={setScheduleFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Email for Reports</Label>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={scheduleEmail}
                      onChange={(e) => setScheduleEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Prime Awards Lookback (months)</Label>
                    <Select value={String(scheduleLookback)} onValueChange={(v) => setScheduleLookback(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 month</SelectItem>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Verticals to Monitor</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-auto">
                      {VERTICAL_OPTIONS.map((v) => (
                        <div key={v} className="flex items-center space-x-2">
                          <Checkbox
                            id={`sched-${v}`}
                            checked={scheduleVerticals.includes(v)}
                            onCheckedChange={(checked) => {
                              if (checked) setScheduleVerticals([...scheduleVerticals, v]);
                              else setScheduleVerticals(scheduleVerticals.filter((sv) => sv !== v));
                            }}
                          />
                          <Label htmlFor={`sched-${v}`} className="text-sm cursor-pointer">
                            {v}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to search all verticals
                    </p>
                  </div>
                  <Button onClick={createSchedule} className="w-full">
                    Create Schedule
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSchedules ? (
            <p className="text-muted-foreground text-sm">Loading schedules...</p>
          ) : !schedules?.length ? (
            <p className="text-muted-foreground text-sm">No scheduled searches yet. Create one to automate your grant monitoring.</p>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border rounded-lg p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "Active" : "Paused"}
                      </Badge>
                      <Badge variant="outline">{s.frequency}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Email: {s.email_address} • Lookback: {s.lookback_months}mo
                      {s.vertical_ids?.length > 0 && ` • Verticals: ${s.vertical_ids.join(", ")}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.last_run_at
                        ? `Last run: ${format(new Date(s.last_run_at), "PPp")}`
                        : "Never run"}
                      {s.next_run_at && ` • Next: ${format(new Date(s.next_run_at), "PPp")}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runPipelineManually(s.id)}
                      title="Run now"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleScheduleActive(s.id, s.is_active)}
                      title={s.is_active ? "Pause" : "Resume"}
                    >
                      {s.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteSchedule(s.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Pipeline Runs */}
      {recentRuns && recentRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Pipeline Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Grants</TableHead>
                    <TableHead>ALNs</TableHead>
                    <TableHead>Prime Awards</TableHead>
                    <TableHead>Sub-Awards</TableHead>
                    <TableHead>CSV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">
                        {format(new Date(run.started_at), "PPp")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "default"
                              : run.status === "running"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.grants_found}</TableCell>
                      <TableCell>{run.unique_alns?.length || 0}</TableCell>
                      <TableCell>{run.prime_awards_found}</TableCell>
                      <TableCell>{run.sub_awards_found}</TableCell>
                      <TableCell>
                        {run.csv_url ? (
                          <a href={run.csv_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1">
                              <Download className="h-3 w-3" />
                              CSV
                            </Button>
                          </a>
                        ) : run.status === "running" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : run.error_message ? (
                          <span className="text-xs text-destructive" title={run.error_message}>
                            Error
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
