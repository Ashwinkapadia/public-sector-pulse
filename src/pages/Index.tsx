import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateSelector } from "@/components/StateSelector";
import { Button } from "@/components/ui/button";
import { LogOut, RefreshCw, Trash2, Save, FileText } from "lucide-react";
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
  const [fetching, setFetching] = useState(false);
  const [fetchingNASBO, setFetchingNASBO] = useState(false);
  const [fetchingGrants, setFetchingGrants] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [fetchSessionId, setFetchSessionId] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: savedSearches } = useSavedSearches();
  const saveSearchMutation = useSaveSearch();
  const deleteSearchMutation = useDeleteSearch();

  useEffect(() => {
    // Check if user is authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
      const { data, error } = await supabase.functions.invoke("fetch-usaspending-data", {
        body: {
          state: selectedState,
          startDate: startDate?.toISOString().split("T")[0],
          endDate: endDate?.toISOString().split("T")[0],
          sessionId,
        },
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
        description: error.message || "An error occurred while fetching data",
      });
      setFetchSessionId(null);
    } finally {
      setFetching(false);
    }
  };

  const handleFetchComplete = () => {
    // Reset fetch session to hide progress
    setFetchSessionId(null);
    setFetching(false);
    
    // Invalidate all queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
    queryClient.invalidateQueries({ queryKey: ["funding_records"] });
    queryClient.invalidateQueries({ queryKey: ["funding_metrics"] });
    queryClient.invalidateQueries({ queryKey: ["subawards-by-state"] });
    
    toast({
      title: "Fetch Complete",
      description: "Dashboard updated with new data",
    });
  };

  const handleFetchNASBOData = async () => {
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
      const { data, error } = await supabase.functions.invoke("fetch-nasbo-data", {
        body: {
          state: selectedState,
          startDate: startDate?.toISOString().split("T")[0],
          endDate: endDate?.toISOString().split("T")[0],
        },
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
        description: error.message || "An error occurred while fetching NASBO data",
      });
    } finally {
      setFetchingNASBO(false);
    }
  };

  const handleFetchGrantsData = async () => {
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
      const { data, error } = await supabase.functions.invoke("fetch-grants-data", {
        body: {
          state: selectedState,
          startDate: startDate?.toISOString().split("T")[0],
          endDate: endDate?.toISOString().split("T")[0],
        },
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
        description: error.message || "An error occurred while fetching Grants.gov data",
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
      // Delete subawards first (due to foreign key constraints)
      const { error: subawardsError } = await supabase
        .from("subawards")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (subawardsError) throw subawardsError;

      // Delete funding records next
      const { error: fundingError } = await supabase
        .from("funding_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (fundingError) throw fundingError;

      // Delete organizations
      const { error: orgError } = await supabase
        .from("organizations")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (orgError) throw orgError;

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

      toast({
        title: "Data cleared",
        description:
          "All funding records, subawards, and organizations have been removed from the dashboard",
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
            <div className="mt-6 flex gap-3 justify-end flex-wrap">
              <Button
                onClick={handleFetchUSASpendingData}
                disabled={fetching || !selectedState}
                className="gap-2"
                size="lg"
              >
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                {fetching ? "Fetching..." : "Fetch USAspending.gov"}
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
        </section>

        {/* Fetch Progress */}
        {fetchSessionId && (
          <section className="mb-8">
            <FetchProgress sessionId={fetchSessionId} onComplete={handleFetchComplete} />
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

        {/* Organizations Table */}
        <section className="mb-8">
          <FundingTable state={selectedState} verticalIds={selectedVerticals} startDate={startDate} endDate={endDate} />
        </section>

        {/* Subawards Table */}
        <section className="mb-8">
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
