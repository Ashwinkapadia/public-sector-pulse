import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, XCircle, X, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ProgressMessage {
  phase: string;
  phaseLabel: string;
  apiPagesTotal: number | string;
  apiPagesFetched: number;
  apiResultsTotal: number;
  recordsPrepared: number;
  recordsInserted: number;
  recordsTotal: number;
  statesTotal?: number;
  statesCompleted?: number;
  currentState?: string;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
}

interface FetchProgressData {
  session_id: string;
  state: string;
  source: string;
  status: string;
  total_pages: number;
  current_page: number;
  records_inserted: number;
  errors: string[];
  message: string | null;
  updated_at: string;
}

interface FetchProgressProps {
  sessionId: string | null;
  onComplete?: () => void;
}

const STALE_TIMEOUT_MS = 90_000;

function parseProgressMessage(message: string | null): ProgressMessage | null {
  if (!message) return null;
  try {
    return JSON.parse(message) as ProgressMessage;
  } catch {
    // Legacy plain-text message
    return null;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function PhaseIndicator({ phase, label }: { phase: string; label: string }) {
  const phases = ["clearing", "api_fetch", "processing", "inserting", "completed"];
  const currentIndex = phases.indexOf(phase);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {phases.slice(0, -1).map((p, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex || phase === "completed";
        return (
          <div key={p} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                isDone
                  ? "bg-green-500"
                  : isActive
                  ? "bg-primary animate-pulse"
                  : "bg-muted"
              }`}
            />
            {i < phases.length - 2 && (
              <div className={`w-4 h-px ${isDone ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
      <span className="ml-1.5 font-medium">{label}</span>
    </div>
  );
}

export function FetchProgress({ sessionId, onComplete }: FetchProgressProps) {
  const [progress, setProgress] = useState<FetchProgressData | null>(null);
  const [isStale, setIsStale] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasCalledComplete = useRef(false);
  const lastUpdateTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!sessionId) {
      setProgress(null);
      setIsStale(false);
      hasCalledComplete.current = false;
      return;
    }

    hasCalledComplete.current = false;
    setIsStale(false);
    lastUpdateTime.current = Date.now();

    const fetchProgressOnce = async () => {
      const { data, error } = await supabase
        .from("fetch_progress")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (error) return null;

      if (data) {
        setProgress((prev) => {
          if (!prev || prev.current_page !== data.current_page || prev.records_inserted !== data.records_inserted || prev.status !== data.status || prev.message !== data.message) {
            lastUpdateTime.current = Date.now();
            setIsStale(false);
          }
          return data;
        });

        if ((data.status === "completed" || data.status === "failed") && !hasCalledComplete.current) {
          hasCalledComplete.current = true;
          onCompleteRef.current?.();
        }
      }

      return data as FetchProgressData;
    };

    fetchProgressOnce();

    const pollIntervalMs = 2000;
    const maxPollMs = 10 * 60 * 1000;
    const startedAt = Date.now();

    const intervalId = window.setInterval(async () => {
      if (hasCalledComplete.current) return;
      if (Date.now() - startedAt > maxPollMs) {
        window.clearInterval(intervalId);
        return;
      }

      if (Date.now() - lastUpdateTime.current > STALE_TIMEOUT_MS) {
        setIsStale(true);
      }

      const latest = await fetchProgressOnce();
      if (!latest) return;
      if (latest.status === "completed" || latest.status === "failed") {
        window.clearInterval(intervalId);
      }
    }, pollIntervalMs);

    const channel = supabase
      .channel(`fetch-progress-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "fetch_progress",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newData = payload.new as FetchProgressData;
          setProgress(newData);
          lastUpdateTime.current = Date.now();
          setIsStale(false);

          if ((newData.status === "completed" || newData.status === "failed") && !hasCalledComplete.current) {
            hasCalledComplete.current = true;
            onCompleteRef.current?.();
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const handleDismiss = () => {
    hasCalledComplete.current = true;
    onCompleteRef.current?.();
  };

  const parsed = useMemo(() => parseProgressMessage(progress?.message ?? null), [progress?.message]);

  if (!sessionId || !progress) return null;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";

  // Calculate elapsed time and ETA
  const startedAt = parsed?.startedAt ? new Date(parsed.startedAt).getTime() : 0;
  const elapsed = startedAt ? Date.now() - startedAt : 0;

  let etaText = "";
  if (parsed && isRunning && startedAt) {
    // For insert phase, estimate based on records progress
    if (parsed.phase === "inserting" && parsed.recordsTotal > 0 && parsed.recordsInserted > 0) {
      const fraction = parsed.recordsInserted / parsed.recordsTotal;
      if (fraction > 0) {
        const totalEstimate = elapsed / fraction;
        const remaining = totalEstimate - elapsed;
        etaText = `~${formatDuration(remaining)} remaining`;
      }
    }
    // For all-states fetch, estimate based on states completed
    else if (parsed.statesTotal && parsed.statesCompleted && parsed.statesCompleted > 0) {
      const fraction = parsed.statesCompleted / parsed.statesTotal;
      if (fraction > 0) {
        const totalEstimate = elapsed / fraction;
        const remaining = totalEstimate - elapsed;
        etaText = `~${formatDuration(remaining)} remaining`;
      }
    }
    // For API fetch phase with multiple pages
    else if (parsed.phase === "api_fetch" && parsed.apiPagesFetched > 1) {
      etaText = "Fetching from API...";
    }
  }

  // Compute an overall progress percent
  let progressPercent = 0;
  if (parsed) {
    if (parsed.phase === "completed") {
      progressPercent = 100;
    } else if (parsed.phase === "clearing" || parsed.phase === "init") {
      progressPercent = 2;
    } else if (parsed.phase === "api_fetch") {
      // 5-40% for API fetch
      const apiTotal = typeof parsed.apiPagesTotal === "number" ? parsed.apiPagesTotal : parsed.apiPagesFetched + 1;
      progressPercent = 5 + (parsed.apiPagesFetched / Math.max(apiTotal, 1)) * 35;
    } else if (parsed.phase === "processing") {
      progressPercent = 45;
    } else if (parsed.phase === "inserting" && parsed.recordsTotal > 0) {
      // 50-95% for insert
      progressPercent = 50 + (parsed.recordsInserted / parsed.recordsTotal) * 45;
    } else if (parsed.phase === "fetching_state" && parsed.statesTotal) {
      // All-states mode
      progressPercent = ((parsed.statesCompleted || 0) / parsed.statesTotal) * 95;
    }
  } else {
    // Fallback for legacy messages
    progressPercent = progress.total_pages > 0
      ? (progress.current_page / progress.total_pages) * 100
      : 0;
  }

  const getStatusIcon = () => {
    if (isStale) return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    if (isRunning) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    if (isCompleted) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (isFailed) return <XCircle className="h-5 w-5 text-destructive" />;
    return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (isStale) return "Fetch may have stalled — no updates received";
    if (parsed?.phaseLabel) return parsed.phaseLabel;
    if (isRunning) return "Fetching data...";
    if (isCompleted) return "Fetch completed successfully";
    if (isFailed) return "Fetch failed";
    return "Unknown status";
  };

  const displayErrors = parsed?.errors?.length ? parsed.errors : (progress.errors?.length ? progress.errors : []);

  return (
    <Card className="p-6 bg-card border">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-sm">{getStatusText()}</h3>
            <p className="text-xs text-muted-foreground">
              {progress.source} • {progress.state}
              {elapsed > 0 && ` • Elapsed: ${formatDuration(elapsed)}`}
            </p>
          </div>
          {etaText && isRunning && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{etaText}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            title="Dismiss and refresh dashboard"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Phase dots */}
        {parsed && isRunning && (
          <PhaseIndicator
            phase={parsed.phase}
            label={
              parsed.phase === "clearing"
                ? "Clear old data"
                : parsed.phase === "api_fetch"
                ? "Fetch from API"
                : parsed.phase === "processing"
                ? "Process records"
                : parsed.phase === "inserting"
                ? "Save to database"
                : parsed.phase === "fetching_state"
                ? `Fetching states (${parsed.statesCompleted || 0}/${parsed.statesTotal || 0})`
                : parsed.phase
            }
          />
        )}

        {/* Stale warning */}
        {isStale && isRunning && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No progress updates for over 90 seconds. The fetch may have timed out.
              Click the X to dismiss and refresh the dashboard.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        {isRunning && !isStale && (
          <Progress value={Math.min(progressPercent, 99)} className="h-2" />
        )}

        {/* Stats */}
        {parsed ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {parsed.apiPagesFetched}
                {typeof parsed.apiPagesTotal === "string" && parsed.apiPagesTotal.includes("+")
                  ? <span className="text-sm font-normal text-muted-foreground">+</span>
                  : parsed.apiPagesTotal && typeof parsed.apiPagesTotal === "number" && parsed.apiPagesTotal > 0
                  ? <span className="text-sm font-normal text-muted-foreground">/{parsed.apiPagesTotal}</span>
                  : null}
              </div>
              <div className="text-xs text-muted-foreground">API Pages Fetched</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {parsed.apiResultsTotal || 0}
              </div>
              <div className="text-xs text-muted-foreground">API Results Found</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {parsed.recordsInserted}
                {parsed.recordsTotal > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">/{parsed.recordsTotal}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Records Inserted</div>
            </div>
          </div>
        ) : (
          /* Fallback for legacy progress */
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{progress.current_page}</div>
              <div className="text-xs text-muted-foreground">Pages Processed</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{progress.records_inserted}</div>
              <div className="text-xs text-muted-foreground">Records Inserted</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{progress.errors?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </div>
        )}

        {/* Errors */}
        {displayErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {displayErrors.map((error, idx) => (
                  <div key={idx} className="text-sm">{error}</div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  );
}
