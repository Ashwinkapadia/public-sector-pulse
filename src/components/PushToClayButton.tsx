import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2 } from "lucide-react";

interface PushToClayButtonProps {
  dataType: "organizations" | "funding_records" | "subawards";
  records: Record<string, unknown>[];
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function PushToClayButton({
  dataType,
  records,
  disabled = false,
  variant = "outline",
  size = "sm",
  className,
}: PushToClayButtonProps) {
  const [isPushing, setIsPushing] = useState(false);
  const { toast } = useToast();

  const handlePushToClay = async () => {
    if (records.length === 0) {
      toast({
        variant: "destructive",
        title: "No data to export",
        description: "There are no records to push to Clay.",
      });
      return;
    }

    setIsPushing(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast({
          variant: "destructive",
          title: "Authentication required",
          description: "Please log in to export data to Clay.",
        });
        return;
      }

      const response = await supabase.functions.invoke("push-to-clay", {
        body: {
          dataType,
          records,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to push to Clay");
      }

      const result = response.data;

      if (result.success) {
        toast({
          title: "Export successful",
          description: result.message,
        });
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Push to Clay error:", error);
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to push data to Clay",
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <Button
      onClick={handlePushToClay}
      disabled={disabled || isPushing || records.length === 0}
      variant={variant}
      size={size}
      className={className}
    >
      {isPushing ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Upload className="h-4 w-4 mr-2" />
      )}
      Push to Clay {records.length > 0 && `(${records.length})`}
    </Button>
  );
}
