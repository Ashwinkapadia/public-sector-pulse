import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, XCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

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

// If no update for this many ms, consider the session stale
const STALE_TIMEOUT_MS = 90_000; // 90 seconds

export function FetchProgress({ sessionId, onComplete }: FetchProgressProps) {
  const [progress, setProgress] = useState<FetchProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isStale, setIsStale] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasCalledComplete = useRef(false);
  const lastUpdateTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!sessionId) {
      setProgress(null);
      setLogs([]);
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
          // Track if data actually changed
          if (!prev || prev.current_page !== data.current_page || prev.records_inserted !== data.records_inserted || prev.status !== data.status) {
            lastUpdateTime.current = Date.now();
            setIsStale(false);
          }
          return data;
        });
        if (data.message) {
          setLogs((prev) => {
            const newLog = `[${new Date(data.updated_at).toLocaleTimeString()}] ${data.message}`;
            if (prev.length > 0 && prev[prev.length - 1] === newLog) return prev;
            return [...prev, newLog];
          });
        }

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

      // Check for stale session
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

          if (newData.message) {
            setLogs((prev) => [
              ...prev,
              `[${new Date(newData.updated_at).toLocaleTimeString()}] ${newData.message}`,
            ]);
          }

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
    // Force complete — dismiss the stuck progress and refresh dashboard
    hasCalledComplete.current = true;
    onCompleteRef.current?.();
  };

  if (!sessionId || !progress) return null;

  const progressPercent = progress.total_pages > 0
    ? (progress.current_page / progress.total_pages) * 100
    : 0;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";

  const getStatusIcon = () => {
    if (isStale) return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    if (isRunning) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    if (isCompleted) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (isFailed) return <XCircle className="h-5 w-5 text-destructive" />;
    return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (isStale) return "Fetch may have stalled — no updates received";
    if (isRunning) return "Fetching data...";
    if (isCompleted) return "Fetch completed successfully";
    if (isFailed) return "Fetch failed";
    return "Unknown status";
  };

  return (
    <Card className="p-6 bg-card border">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{getStatusText()}</h3>
            <p className="text-sm text-muted-foreground">
              {progress.source} • {progress.state}
            </p>
          </div>
          {/* Dismiss button — always available so user can close stuck progress */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            title="Dismiss and refresh dashboard"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Stale warning */}
        {isStale && isRunning && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No progress updates for over 90 seconds. The fetch may have timed out.
              Click the X to dismiss and refresh the dashboard with whatever data was inserted.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        {isRunning && !isStale && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {progress.total_pages > 0
                  ? `${progress.total_pages} total pages found • ${progress.current_page} pages processed`
                  : "Discovering pages..."}
              </span>
              <span className="text-muted-foreground">
                {progress.total_pages > 0 ? `${Math.round(progressPercent)}%` : ""}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <div className="text-2xl font-bold text-foreground">
              {progress.current_page}
            </div>
            <div className="text-xs text-muted-foreground">Pages Processed</div>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <div className="text-2xl font-bold text-foreground">
              {progress.records_inserted}
            </div>
            <div className="text-xs text-muted-foreground">Records Inserted</div>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <div className="text-2xl font-bold text-foreground">
              {progress.errors?.length || 0}
            </div>
            <div className="text-xs text-muted-foreground">Errors</div>
          </div>
        </div>

        {/* Errors */}
        {progress.errors && progress.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {progress.errors.map((error, idx) => (
                  <div key={idx} className="text-sm">
                    {error}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Activity Log */}
        {logs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Activity Log</h4>
            <ScrollArea className="h-32 rounded-md border bg-secondary/20 p-3">
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="text-xs font-mono text-muted-foreground">
                    {log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </Card>
  );
}
