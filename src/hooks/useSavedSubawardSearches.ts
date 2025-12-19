import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SavedSubawardSearch {
  id: string;
  name: string;
  cfda_number: string | null;
  keywords: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export function useSavedSubawardSearches() {
  const [savedSearches, setSavedSearches] = useState<SavedSubawardSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSavedSearches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saved_subaward_searches")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSavedSearches(data || []);
    } catch (error: any) {
      console.error("Error fetching saved searches:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load saved searches",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSearch = async (
    name: string,
    cfdaNumber: string,
    keywords: string,
    startDate: string,
    endDate: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "You must be logged in to save searches",
        });
        return false;
      }

      const { error } = await supabase.from("saved_subaward_searches").insert({
        user_id: user.id,
        name: name.trim(),
        cfda_number: cfdaNumber.trim() || null,
        keywords: keywords.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });

      if (error) throw error;

      toast({
        title: "Search Saved",
        description: `"${name}" has been saved`,
      });

      await fetchSavedSearches();
      return true;
    } catch (error: any) {
      console.error("Error saving search:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save search",
      });
      return false;
    }
  };

  const deleteSearch = async (id: string) => {
    try {
      const { error } = await supabase
        .from("saved_subaward_searches")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Search Deleted",
        description: "Saved search has been removed",
      });

      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (error: any) {
      console.error("Error deleting search:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete search",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchSavedSearches();
  }, []);

  return {
    savedSearches,
    loading,
    saveSearch,
    deleteSearch,
    refetch: fetchSavedSearches,
  };
}
