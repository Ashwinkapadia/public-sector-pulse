import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export function FetchProgress({ sessionId, onComplete }: FetchProgressProps) {
  const [progress, setProgress] = useState<FetchProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    // Initial fetch
    const fetchProgress = async () => {
      const { data } = await supabase
        .from("fetch_progress")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (data) {
        setProgress(data);
        if (data.message) {
          setLogs((prev) => [...prev, `[${new Date(data.updated_at).toLocaleTimeString()}] ${data.message}`]);
        }
      }
    };

    fetchProgress();

    // Subscribe to realtime updates
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
          
          if (newData.message) {
            setLogs((prev) => [
              ...prev,
              `[${new Date(newData.updated_at).toLocaleTimeString()}] ${newData.message}`,
            ]);
          }

          if (newData.status === "completed" || newData.status === "failed") {
            onComplete?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, onComplete]);

  if (!sessionId || !progress) return null;

  const progressPercent = progress.total_pages > 0 
    ? (progress.current_page / progress.total_pages) * 100 
    : 0;

  const getStatusIcon = () => {
    switch (progress.status) {
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case "running":
        return "Fetching data...";
      case "completed":
        return "Fetch completed successfully";
      case "failed":
        return "Fetch failed";
      default:
        return "Unknown status";
    }
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
        </div>

        {/* Progress Bar */}
        {progress.status === "running" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {progress.total_pages} total pages found • {progress.current_page} pages processed
              </span>
              <span className="text-muted-foreground">
                {Math.round(progressPercent)}%
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
