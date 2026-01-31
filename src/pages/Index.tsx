import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateSelector } from "@/components/StateSelector";
import { Button } from "@/components/ui/button";
import { LogOut, RefreshCw, Trash2, Save, FileText, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DateRangeSlider } from "@/components/DateRangeSlider";
import { FundingMetrics } from "@/components/FundingMetrics";
import { FundingChart } from "@/components/FundingChart";
import { FundingTable } from "@/components/FundingTable";
import { SubawardsTable } from "@/components/SubawardsTable";
import { DataSources } from "@/components/DataSources";
import { BonterraLogo } from "@/components/BonterraLogo";
import { useSavedSearches, useSaveSearch, useDeleteSearch } from "@/hooks/useSavedSearches";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VerticalsFilter } from "@/components/VerticalsFilter";
import { FetchProgress } from "@/components/FetchProgress";

const Index = () => {
  const [selectedState, setSelectedState] = useState<string>();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchingSubawards, setFetchingSubawards] = useState(false);
  const [fetchingNASBO, setFetchingNASBO] = useState(false);
  const [fetchingGrants, setFetchingGrants] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [fetchSessionId, setFetchSessionId] = useState<string | null>(null);
  const [subawardsFetchSessionId, setSubawardsFetchSessionId] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: savedSearches } = useSavedSearches();
  const saveSearchMutation = useSaveSearch();
  const deleteSearchMutation = useDeleteSearch();

  const getSessionWithTimeout = async (timeoutMs = 8000) => {
    let timeoutId: number | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("getSession timed out")), timeoutMs);
      });

      const result = await Promise.race([supabase.auth.getSession(), timeoutPromise]);
      return result as Awaited<ReturnType<typeof supabase.auth.getSession>>;
    } catch (err) {
      console.error("getSessionWithTimeout failed:", err);
      return { data: { session: null }, error: err } as any;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const refreshAdminStatus = async () => {
    // IMPORTANT: This must never leave the UI stuck in a loading state.
    // We guard against network hangs with a timeout and always resolve.
    try {
      const {
        data: { session },
      } = await getSessionWithTimeout();

      if (!session?.user?.id) {
        setIsAdmin(null);
        return;
      }

      const timeoutMs = 8000;
      let timeoutId: number | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("Role check timed out")), timeoutMs);
      });

      const rolePromise = supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });

      const { data, error } = await Promise.race([rolePromise, timeoutPromise]);
      if (timeoutId) window.clearTimeout(timeoutId);

      if (error) {
        console.error("Error checking admin role:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(Boolean(data));
    } catch (err) {
      console.error("Admin status check failed:", err);
      // Non-blocking: treat as not admin rather than hanging the app.
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener FIRST (recommended by Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      try {
        if (!session) {
          setIsAdmin(null);
          navigate("/auth");
          return;
        }

        await refreshAdminStatus();
      } catch (err) {
        console.error("Auth state handling failed:", err);
      } finally {
        // Always end loading even if role check fails/hangs/throws
        setLoading(false);
      }
    });

    // Then check current session
    getSessionWithTimeout().then(async ({ data: { session } }) => {
      if (!isMounted) return;

      try {
        if (!session) {
          navigate("/auth");
          return;
        }

        await refreshAdminStatus();
      } catch (err) {
        console.error("Initial session check failed:", err);
      } finally {
        // Always end loading even if role check fails/hangs/throws
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const invokeWithAuth = async <T = any>(
    functionName: string,
    body: Record<string, unknown>
  ) => {
    const {
      data: { session },
    } = await getSessionWithTimeout();

    if (!session?.access_token) {
      throw new Error("Not authenticated. Please sign in again.");
    }

    // Helpful debug signal when diagnosing auth/role issues
    console.debug("invokeWithAuth", {
      functionName,
      userId: session.user.id,
      hasToken: Boolean(session.access_token),
    });

    return supabase.functions.invoke<T>(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  };

  const formatInvokeError = (error: any) => {
    // supabase-js FunctionsHttpError often carries useful response data in `context`
    const status = error?.context?.status ?? error?.status;
    const body = error?.context?.body;

    if (body) {
      const bodyMsg =
        typeof body === "string" ? body : body.error || body.message || JSON.stringify(body);
      return status ? `${status}: ${bodyMsg}` : bodyMsg;
    }

    if (status) return `${status}: ${error?.message || "Request failed"}`;

    return error?.message || "An error occurred";
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to log out",
      });
    } else {
      navigate("/auth");
    }
  };

  const handleFetchUSASpendingData = async () => {
    if (isAdmin === false) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Your account does not have permission to run data imports.",
      });
      return;
    }

    if (!selectedState) {
      toast({
        variant: "destructive",
        title: "State Required",
        description: "Please select a state before fetching data",
      });
      return;
    }

    setFetching(true);
    const sessionId = crypto.randomUUID();
    setFetchSessionId(sessionId);
    
    try {
      const { data, error } = await invokeWithAuth("fetch-usaspending-data", {
        state: selectedState,
        startDate: startDate?.toISOString().split("T")[0],
        endDate: endDate?.toISOString().split("T")[0],
        sessionId,
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Fetched ${data?.recordsAdded || 0} funding records from USAspending.gov`,
      });
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch data",
        description: formatInvokeError(error),
      });
      setFetchSessionId(null);
    } finally {
      setFetching(false);
    }
  };

  const handleFetchComplete = useCallback(() => {
    // Reset fetch session to hide progress
    setFetchSessionId(null);
    setFetching(false);
    
    // Invalidate all queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
    queryClient.invalidateQueries({ queryKey: ["funding_records"] });
    queryClient.invalidateQueries({ queryKey: ["funding_metrics"] });

    // Ensure active queries refetch immediately (invalidate alone can be too lazy depending on config)
    queryClient.refetchQueries({ queryKey: ["funding_records"], type: "active" });
    queryClient.refetchQueries({ queryKey: ["funding_metrics"], type: "active" });

    // Defensive: ingestion completion/status write can race the final inserts; refetch once more shortly after
    window.setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["funding_records"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["funding_metrics"], type: "active" });
    }, 1500);
    
    toast({
      title: "Prime Awards Fetch Complete",
      description: "Dashboard updated with new prime award data",
    });
  }, [queryClient, toast]);

  const handleFetchSubawardsData = async () => {
    if (isAdmin === false) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Your account does not have permission to run data imports.",
      });
      return;
    }

    if (!selectedState) {
      toast({
        variant: "destructive",
        title: "State Required",
        description: "Please select a state before fetching subawards",
      });
      return;
    }

    setFetchingSubawards(true);
    const sessionId = crypto.randomUUID();
    setSubawardsFetchSessionId(sessionId);
    
    try {
      const { data, error } = await invokeWithAuth("fetch-subawards-data", {
        state: selectedState,
        startDate: startDate?.toISOString().split("T")[0],
        endDate: endDate?.toISOString().split("T")[0],
        sessionId,
      });

      if (error) throw error;

      toast({
        title: "Subawards Fetch Started",
        description: "Fetching subawards in background...",
      });
    } catch (error: any) {
      console.error("Error fetching subawards:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch subawards",
        description: formatInvokeError(error),
      });
      setSubawardsFetchSessionId(null);
    } finally {
      setFetchingSubawards(false);
    }
  };

  const handleSubawardsFetchComplete = useCallback(() => {
    setSubawardsFetchSessionId(null);
    setFetchingSubawards(false);
    
    queryClient.invalidateQueries({ queryKey: ["subawards-by-state"] });
    
    toast({
      title: "Subawards Fetch Complete",
      description: "Subawards data updated",
    });
  }, [queryClient, toast]);

  const handleFetchNASBOData = async () => {
    if (isAdmin === false) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Your account does not have permission to run data imports.",
      });
      return;
    }

    if (!selectedState) {
      toast({
        variant: "destructive",
        title: "State Required",
        description: "Please select a state before fetching data",
      });
      return;
    }

    setFetchingNASBO(true);
    
    try {
      const { data, error } = await invokeWithAuth("fetch-nasbo-data", {
        state: selectedState,
        startDate: startDate?.toISOString().split("T")[0],
        endDate: endDate?.toISOString().split("T")[0],
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Fetched ${data?.recordsCreated || 0} NASBO budget records`,
      });

      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["funding_records"] });
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"] });
      queryClient.invalidateQueries({ queryKey: ["subawards-by-state"] });
    } catch (error: any) {
      console.error("Error fetching NASBO data:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch NASBO data",
        description: formatInvokeError(error),
      });
    } finally {
      setFetchingNASBO(false);
    }
  };

  const handleFetchGrantsData = async () => {
    if (isAdmin === false) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Your account does not have permission to run data imports.",
      });
      return;
    }

    if (!selectedState) {
      toast({
        variant: "destructive",
        title: "State Required",
        description: "Please select a state before fetching data",
      });
      return;
    }

    setFetchingGrants(true);
    
    try {
      const { data, error } = await invokeWithAuth("fetch-grants-data", {
        state: selectedState,
        startDate: startDate?.toISOString().split("T")[0],
        endDate: endDate?.toISOString().split("T")[0],
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Fetched ${data?.recordsAdded || 0} grant opportunities from Grants.gov`,
      });

      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["funding_records"] });
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"] });
      queryClient.invalidateQueries({ queryKey: ["subawards-by-state"] });
    } catch (error: any) {
      console.error("Error fetching Grants.gov data:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch Grants.gov data",
        description: formatInvokeError(error),
      });
    } finally {
      setFetchingGrants(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedState(undefined);
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedVerticals([]);
    toast({
      title: "Filters cleared",
      description: "All filters have been reset",
    });
  };

  const handleClearData = async () => {
    try {
      // Use secure edge function for bulk deletion with audit trail
      const { data, error } = await invokeWithAuth("admin-clear-data", {});

      if (error) {
        const errorData = formatInvokeError(error);
        if (errorData.status === 401) {
          throw new Error("Authentication required. Please log in again.");
        } else if (errorData.status === 403) {
          throw new Error("Admin privileges required for this operation.");
        }
        throw new Error(errorData.message || "Failed to clear data");
      }

      // Reset local filters and state
      setSelectedState(undefined);
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedVerticals([]);
      setFetchSessionId(null);

      // Invalidate cached queries so the dashboard reflects cleared data
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["funding_records"] });
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"] });
      queryClient.invalidateQueries({ queryKey: ["subawards-by-state"] });

      const deleted = data?.deleted || {};
      toast({
        title: "Data cleared",
        description: `Removed ${deleted.subawards || 0} subawards, ${deleted.funding_records || 0} funding records, and ${deleted.organizations || 0} organizations`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to clear data",
        description: error.message || "An error occurred while clearing data",
      });
    }
  };
  const handleSaveSearch = async () => {
    if (!searchName.trim()) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Please enter a name for this search",
      });
      return;
    }

    try {
      await saveSearchMutation.mutateAsync({
        name: searchName,
        state: selectedState,
        start_date: startDate?.toISOString().split("T")[0],
        end_date: endDate?.toISOString().split("T")[0],
        source: 'USAspending',
      });

      toast({
        title: "Search saved",
        description: "Your search has been saved successfully",
      });

      setSaveDialogOpen(false);
      setSearchName("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to save search",
        description: error.message || "An error occurred while saving the search",
      });
    }
  };

  const handleLoadSearch = (searchId: string) => {
    const search = savedSearches?.find(s => s.id === searchId);
    if (search) {
      setSelectedState(search.state || undefined);
      setStartDate(search.start_date ? new Date(search.start_date) : undefined);
      setEndDate(search.end_date ? new Date(search.end_date) : undefined);
      toast({
        title: "Search loaded",
        description: `Loaded search: ${search.name}`,
      });
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    try {
      await deleteSearchMutation.mutateAsync(searchId);
      toast({
        title: "Search deleted",
        description: "Your saved search has been deleted",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete search",
        description: error.message || "An error occurred while deleting the search",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BonterraLogo className="h-8" />
              <div className="h-8 w-px bg-border" />
              <h1 className="text-xl font-bold text-foreground">
                Government Funding Intelligence
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Public Sector Dashboard
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Action Buttons */}
        <section className="mb-6">
          <div className="flex gap-3 justify-end">
            <Button
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Clear Filters
            </Button>
            <Button
              onClick={() => navigate("/subawards")}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              View Subawards
            </Button>
            <Button
              onClick={() => navigate("/sub-awards")}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              Sub-Award Intelligence
            </Button>
            <Button
              onClick={handleClearData}
              variant="destructive"
              size="sm"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear All Data
            </Button>
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Search
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Current Search</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Enter search name..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                  />
                  <Button onClick={handleSaveSearch} className="w-full">
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {/* Filters Section */}
        <section className="mb-8">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                Filter Data
              </h2>
              {savedSearches && savedSearches.length > 0 && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Select onValueChange={handleLoadSearch}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Load saved search" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedSearches.map((search) => (
                        <SelectItem key={search.id} value={search.id}>
                          {search.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select State
                </label>
                <StateSelector
                  value={selectedState}
                  onChange={setSelectedState}
                />
              </div>
              <DateRangeSlider
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            </div>
            <div className="mt-6">
              <VerticalsFilter
                selectedVerticals={selectedVerticals}
                onSelectVerticals={setSelectedVerticals}
              />
            </div>
            {/* Prime Awards Fetch Section */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Prime Awards</h3>
              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={handleFetchUSASpendingData}
                  disabled={fetching || !selectedState}
                  className="gap-2"
                  size="lg"
                >
                  <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                  {fetching ? "Fetching..." : "Fetch Prime Awards (USAspending)"}
                </Button>
                <Button
                  onClick={handleFetchGrantsData}
                  disabled={fetchingGrants || !selectedState}
                  className="gap-2"
                  size="lg"
                  variant="secondary"
                >
                  <RefreshCw className={`h-4 w-4 ${fetchingGrants ? "animate-spin" : ""}`} />
                  {fetchingGrants ? "Fetching..." : "Fetch Grants.gov"}
                </Button>
                <Button
                  onClick={handleFetchNASBOData}
                  disabled={fetchingNASBO || !selectedState}
                  className="gap-2"
                  size="lg"
                  variant="outline"
                >
                  <RefreshCw className={`h-4 w-4 ${fetchingNASBO ? "animate-spin" : ""}`} />
                  {fetchingNASBO ? "Fetching..." : "Fetch NASBO Data"}
                </Button>
              </div>
            </div>

            {/* Subawards Fetch Section */}
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-semibold text-foreground mb-3">Subawards</h3>
              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={handleFetchSubawardsData}
                  disabled={fetchingSubawards || !selectedState}
                  className="gap-2"
                  size="lg"
                  variant="secondary"
                >
                  <RefreshCw className={`h-4 w-4 ${fetchingSubawards ? "animate-spin" : ""}`} />
                  {fetchingSubawards ? "Fetching..." : "Fetch Subawards (USAspending)"}
                </Button>
                <p className="text-sm text-muted-foreground self-center">
                  Requires prime awards to be fetched first
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Prime Awards Fetch Progress */}
        {fetchSessionId && (
          <section className="mb-8">
            <FetchProgress sessionId={fetchSessionId} onComplete={handleFetchComplete} />
          </section>
        )}

        {/* Subawards Fetch Progress */}
        {subawardsFetchSessionId && (
          <section className="mb-8">
            <FetchProgress sessionId={subawardsFetchSessionId} onComplete={handleSubawardsFetchComplete} />
          </section>
        )}

        {/* Metrics Overview */}
        <section className="mb-8">
          <FundingMetrics state={selectedState} startDate={startDate} endDate={endDate} verticalIds={selectedVerticals} />
        </section>

        {/* Funding Chart */}
        <section className="mb-8">
          <FundingChart state={selectedState} />
        </section>

        {/* Prime Awards Table */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Prime Awards</h2>
          <FundingTable state={selectedState} verticalIds={selectedVerticals} startDate={startDate} endDate={endDate} />
        </section>

        {/* Subawards Table */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Subawards</h2>
          <SubawardsTable state={selectedState} startDate={startDate} endDate={endDate} />
        </section>

        {/* Data Sources */}
        <section>
          <DataSources />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-12">
        <div className="container mx-auto px-6 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              Data aggregated from public government sources including USAspending.gov,
              Grants.gov, and state budget offices
            </p>
            <p className="mt-2">
              This dashboard is for internal use by Bonterra's Public Sector team
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
