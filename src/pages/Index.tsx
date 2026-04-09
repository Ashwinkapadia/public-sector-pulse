import { useState, useEffect, useCallback, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyTrailDiscovery } from "@/components/MoneyTrailDiscovery";
import { GrantMonitor } from "@/components/GrantMonitor";
import { format } from "date-fns";

const Index = () => {
  const [selectedState, setSelectedState] = useState<string | undefined>(() => {
    return localStorage.getItem("dashboard_state") || undefined;
  });
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("dashboard_startDate");
    return saved ? new Date(saved) : undefined;
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem("dashboard_endDate");
    return saved ? new Date(saved) : undefined;
  });
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>(() => {
    const saved = localStorage.getItem("dashboard_verticals");
    return saved ? JSON.parse(saved) : [];
  });
  const [alnFilter, setAlnFilter] = useState<string>(() => {
    return localStorage.getItem("dashboard_aln") || "";
  });
  const [appliedState, setAppliedState] = useState<string | undefined>();
  const [appliedStartDate, setAppliedStartDate] = useState<Date | undefined>();
  const [appliedEndDate, setAppliedEndDate] = useState<Date | undefined>();
  const [appliedVerticals, setAppliedVerticals] = useState<string[]>([]);
  const [appliedAlnFilter, setAppliedAlnFilter] = useState("");
  const [hasAppliedSearch, setHasAppliedSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchingSubawards, setFetchingSubawards] = useState(false);
  const [fetchingNASBO, setFetchingNASBO] = useState(false);
  const [fetchingGrants, setFetchingGrants] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
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

  const refreshAdminStatus = async (userId?: string) => {
    // Accept userId directly to avoid re-calling getSession (which can hang during token refresh).
    try {
      const uid = userId || (await supabase.auth.getUser().then(r => r.data.user?.id));

      if (!uid) {
        setIsAdmin(null);
        return;
      }

      const { data, error } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });

      if (error) {
        console.error("Error checking admin role:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(Boolean(data));
    } catch (err) {
      console.error("Admin status check failed:", err);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      console.log("[Auth] event:", event, "hasSession:", !!session);

      if (!session) {
        setIsAdmin(null);
        setLoading(false);
        if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
          navigate("/auth");
        }
        return;
      }

      // CRITICAL: Do NOT await inside onAuthStateChange — it can deadlock.
      // Defer the RPC call with setTimeout so it runs outside the listener.
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          await refreshAdminStatus(session.user.id);
        } catch (err) {
          console.error("Admin status check failed:", err);
        } finally {
          if (isMounted) setLoading(false);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // When switching TO the dashboard tab, hydrate filters from localStorage once
  // (e.g. after Grant Monitor exports ALNs).
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === "dashboard" && prevTabRef.current !== "dashboard") {
      const savedAln = localStorage.getItem("dashboard_aln") || "";
      const savedStart = localStorage.getItem("dashboard_startDate");
      const savedEnd = localStorage.getItem("dashboard_endDate");
      const shouldAutoFetch = localStorage.getItem("dashboard_autoFetch") === "true";

      if (savedAln) setAlnFilter(savedAln);
      if (savedStart) setStartDate(new Date(savedStart));
      if (savedEnd) setEndDate(new Date(savedEnd));

      if (shouldAutoFetch && savedAln) {
        localStorage.removeItem("dashboard_autoFetch");
        // Auto-apply filters and trigger fetch after state updates settle
        setTimeout(() => {
          applyDashboardFilters().then(() => {
            startPrimeAwardsFetch(savedAln);
          });
        }, 100);
      } else {
        setHasAppliedSearch(false);
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  const startPrimeAwardsFetch = useCallback(async (
    alnValue?: string,
    options?: { silent?: boolean }
  ) => {
    const effectiveAln = (alnValue ?? alnFilter).trim();
    const requestState = selectedState === "ALL" && effectiveAln ? undefined : selectedState || undefined;
    const silent = options?.silent ?? false;

    if (fetching) return false;

    if (isAdmin === false) {
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Admin access required",
          description: "Your account does not have permission to run data imports.",
        });
      }
      return false;
    }

    if (!selectedState && !effectiveAln) {
      if (!silent) {
        toast({
          variant: "destructive",
          title: "State or ALN Required",
          description: "Please select a state or enter ALN numbers before fetching data",
        });
      }
      return false;
    }

    setFetching(true);
    const sessionId = crypto.randomUUID();
    setFetchSessionId(sessionId);

    try {
      const { error } = await invokeWithAuth("fetch-usaspending-data", {
        state: requestState,
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
        alnNumber: effectiveAln || undefined,
        sessionId,
      });

      if (error) throw error;

      toast({
        title: silent ? "ALN Search Started" : "Prime Awards Fetch Started",
        description: effectiveAln
          ? `Fetching prime awards for ALN ${effectiveAln}...`
          : "Fetching prime awards in the background...",
      });

      return true;
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch data",
        description: formatInvokeError(error),
      });
      setFetchSessionId(null);
      setFetching(false);
      return false;
    }
  }, [alnFilter, endDate, fetching, isAdmin, selectedState, startDate, toast]);

  const applyDashboardFilters = async () => {
    setAppliedState(selectedState);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedVerticals(selectedVerticals);
    setAppliedAlnFilter(alnFilter.trim());
    setHasAppliedSearch(true);
    localStorage.setItem("dashboard_hasAppliedSearch", "true");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["funding_records"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["subawards-by-state"], exact: false }),
    ]);
  };

  // Persist filters to localStorage so they survive page refresh
  useEffect(() => {
    if (selectedState) localStorage.setItem("dashboard_state", selectedState);
    else localStorage.removeItem("dashboard_state");
    if (startDate) localStorage.setItem("dashboard_startDate", startDate.toISOString());
    else localStorage.removeItem("dashboard_startDate");
    if (endDate) localStorage.setItem("dashboard_endDate", endDate.toISOString());
    else localStorage.removeItem("dashboard_endDate");
    localStorage.setItem("dashboard_verticals", JSON.stringify(selectedVerticals));
    if (alnFilter) localStorage.setItem("dashboard_aln", alnFilter);
    else localStorage.removeItem("dashboard_aln");
  }, [selectedState, startDate, endDate, selectedVerticals, alnFilter]);

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
    await applyDashboardFilters();
    await startPrimeAwardsFetch();
  };

  const handleFetchComplete = useCallback(async () => {
    // Reset fetch session to hide progress
    setFetchSessionId(null);
    setFetching(false);

    console.debug("handleFetchComplete: refreshing dashboard data");

    // Use invalidateQueries instead of removeQueries to preserve active observers.
    // removeQueries destroys the query entirely, so refetchQueries has nothing to target.
    // invalidateQueries marks data as stale and triggers active hook observers to refetch.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["organizations"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["funding_records"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"], exact: false }),
    ]);
    console.debug("handleFetchComplete: initial invalidation done");

    // Defensive: edge function may still be writing final rows; invalidate once more after a short delay
    window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["funding_records"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"], exact: false });
      console.debug("handleFetchComplete: delayed invalidation done");
    }, 2000);

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
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
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

    if (!selectedState && !alnFilter.trim()) {
      toast({
        variant: "destructive",
        title: "State or ALN Required",
        description: "Please select a state or enter ALN numbers before fetching data",
      });
      return;
    }

    await applyDashboardFilters();
    setFetchingNASBO(true);

    
    try {
      const { data, error } = await invokeWithAuth("fetch-nasbo-data", {
        state: selectedState,
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
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

    if (!selectedState && !alnFilter.trim()) {
      toast({
        variant: "destructive",
        title: "State or ALN Required",
        description: "Please select a state or enter ALN numbers before fetching data",
      });
      return;
    }

    await applyDashboardFilters();
    setFetchingGrants(true);
    
    try {
      const { data, error } = await invokeWithAuth("fetch-grants-data", {
        state: selectedState,
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
        alnNumber: alnFilter.trim() || undefined,
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
    setAlnFilter("");
    setAppliedState(undefined);
    setAppliedStartDate(undefined);
    setAppliedEndDate(undefined);
    setAppliedVerticals([]);
    setAppliedAlnFilter("");
    setHasAppliedSearch(false);
    localStorage.removeItem("dashboard_state");
    localStorage.removeItem("dashboard_startDate");
    localStorage.removeItem("dashboard_endDate");
    localStorage.removeItem("dashboard_verticals");
    localStorage.removeItem("dashboard_aln");
    localStorage.removeItem("dashboard_hasAppliedSearch");
    localStorage.removeItem("dashboard_autoFetch");
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
      setAlnFilter("");
      setAppliedState(undefined);
      setAppliedStartDate(undefined);
      setAppliedEndDate(undefined);
      setAppliedVerticals([]);
      setAppliedAlnFilter("");
      setHasAppliedSearch(false);
      setFetchSessionId(null);
      localStorage.removeItem("dashboard_aln");
      localStorage.removeItem("dashboard_startDate");
      localStorage.removeItem("dashboard_endDate");
      localStorage.removeItem("dashboard_verticals");
      localStorage.removeItem("dashboard_hasAppliedSearch");
      localStorage.removeItem("dashboard_autoFetch");

      // HARD-RESET: Remove all cached funding/metrics/org data so stale rows cannot appear.
      queryClient.removeQueries({ queryKey: ["organizations"], exact: false });
      queryClient.removeQueries({ queryKey: ["funding_records"], exact: false });
      queryClient.removeQueries({ queryKey: ["funding_metrics"], exact: false });
      queryClient.removeQueries({ queryKey: ["subawards-by-state"], exact: false });
      // Also invalidate to trigger fresh fetches for active observers
      queryClient.invalidateQueries({ queryKey: ["organizations"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["funding_records"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["funding_metrics"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["subawards-by-state"], exact: false });

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
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        end_date: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
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
      setHasAppliedSearch(false);
      localStorage.removeItem("dashboard_hasAppliedSearch");
      toast({
        title: "Search loaded",
        description: `Loaded search: ${search.name}. Click a source button to run it.`,
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard">Prime Awards Dashboard</TabsTrigger>
            <TabsTrigger value="money-trail">💰 Money Trail Discovery</TabsTrigger>
            <TabsTrigger value="grant-monitor">🔍 Grant Monitor</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Select State
                    </label>
                    <StateSelector
                      value={selectedState}
                      onChange={setSelectedState}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      ALN / CFDA Number (optional)
                    </label>
                    <Input
                      placeholder="e.g. 93.778 or 10.551,10.561"
                      value={alnFilter}
                      onChange={(e) => setAlnFilter(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Comma-separated for multiple ALNs
                    </p>
                  </div>
                  <DateRangeSlider
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>

                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <div>
                    Draft filters: state={selectedState || "(none)"} • ALN={alnFilter || "(none)"} • start=
                    {startDate ? format(startDate, "yyyy-MM-dd") : "(none)"} • end=
                    {endDate ? format(endDate, "yyyy-MM-dd") : "(none)"} • verticals=
                    {selectedVerticals.length}
                  </div>
                  <div>
                    {hasAppliedSearch
                      ? `Applied search: state=${appliedState || "(none)"} • ALN=${appliedAlnFilter || "(none)"} • start=${appliedStartDate ? format(appliedStartDate, "yyyy-MM-dd") : "(none)"} • end=${appliedEndDate ? format(appliedEndDate, "yyyy-MM-dd") : "(none)"} • verticals=${appliedVerticals.length}`
                      : "Results update only after you click one of the source buttons below."}
                  </div>
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
                      disabled={fetching || (!selectedState && !alnFilter.trim())}
                      className="gap-2"
                      size="lg"
                    >
                      <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                      {fetching ? "Fetching..." : "Fetch Prime Awards (USAspending)"}
                    </Button>
                    <Button
                      onClick={handleFetchGrantsData}
                      disabled={fetchingGrants || (!selectedState && !alnFilter.trim())}
                      className="gap-2"
                      size="lg"
                      variant="secondary"
                    >
                      <RefreshCw className={`h-4 w-4 ${fetchingGrants ? "animate-spin" : ""}`} />
                      {fetchingGrants ? "Fetching..." : "Fetch Grants.gov"}
                    </Button>
                    <Button
                      onClick={handleFetchNASBOData}
                      disabled={fetchingNASBO || (!selectedState && !alnFilter.trim())}
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

            {hasAppliedSearch ? (
              <>
                {/* Metrics Overview */}
                <section className="mb-8">
                  <FundingMetrics state={appliedState} startDate={appliedStartDate} endDate={appliedEndDate} verticalIds={appliedVerticals} alnFilter={appliedAlnFilter} />
                </section>

                {/* Funding Chart */}
                <section className="mb-8">
                  <FundingChart state={appliedState} startDate={appliedStartDate} endDate={appliedEndDate} verticalIds={appliedVerticals} alnFilter={appliedAlnFilter} />
                </section>

                {/* Prime Awards Table */}
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Prime Awards</h2>
                  <FundingTable state={appliedState} verticalIds={appliedVerticals} startDate={appliedStartDate} endDate={appliedEndDate} alnFilter={appliedAlnFilter} />
                </section>

                {/* Subawards Table */}
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Subawards</h2>
                  <SubawardsTable state={appliedState} startDate={appliedStartDate} endDate={appliedEndDate} />
                </section>
              </>
            ) : (
              <section className="mb-8">
                <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
                  Set your filters, then click one of the <span className="font-medium text-foreground">source buttons</span> to load results.
                </div>
              </section>
            )}

            {/* Data Sources */}
            <section>
              <DataSources />
            </section>
          </TabsContent>

          <TabsContent value="money-trail">
            <MoneyTrailDiscovery />
          </TabsContent>

          <TabsContent value="grant-monitor" forceMount className="data-[state=inactive]:hidden">
            <GrantMonitor onSwitchTab={setActiveTab} />
          </TabsContent>
        </Tabs>
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
