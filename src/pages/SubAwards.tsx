import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BonterraLogo } from "@/components/BonterraLogo";
import { SubAwardSearchForm, SubAwardSearchFormRef } from "@/components/SubAwardSearchForm";
import { SubAwardResultsTable } from "@/components/SubAwardResultsTable";
import { useSubAwardSearch } from "@/hooks/useSubAwardSearch";
import { useSavedSubawardSearches } from "@/hooks/useSavedSubawardSearches";
import { Agency } from "@/components/AgencyMultiSelect";

export default function SubAwards() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const formRef = useRef<SubAwardSearchFormRef>(null);
  const autoSearchTriggered = useRef(false);

  const {
    loading: searching,
    results,
    page,
    hasNext,
    total,
    searchSubAwards,
    clearResults,
    goToPage,
  } = useSubAwardSearch();

  const {
    savedSearches,
    loading: savedSearchesLoading,
    saveSearch,
    deleteSearch,
  } = useSavedSubawardSearches();

  // Handle cfda_list query parameter from Prime Awards page
  useEffect(() => {
    if (autoSearchTriggered.current || loading) return;

    const cfdaList = searchParams.get("cfda_list");
    if (cfdaList && formRef.current) {
      autoSearchTriggered.current = true;

      // Parse all CFDA codes (no limit)
      const codes = cfdaList.split(",").map(c => c.trim()).filter(Boolean);
      const cfdaString = codes.join(",");

      // Set the CFDA field and trigger search with the value directly
      formRef.current.setCfdaNumber(cfdaString);
      formRef.current.triggerSearch(cfdaString);
      
      toast({
        title: "Sub-Awards Loaded",
        description: `Loaded sub-awards for ${codes.length} program${codes.length > 1 ? "s" : ""} from your previous search.`,
      });
    }
  }, [loading, searchParams, toast]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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

  const handleSearch = async (
    cfdaNumber: string,
    keywords: string,
    startDate: string,
    endDate: string,
    state: string,
    agencies: Agency[]
  ) => {
    if (!cfdaNumber.trim() && !keywords.trim() && agencies.length === 0) {
      toast({
        variant: "destructive",
        title: "Search Required",
        description: "Please enter a CFDA number, keywords, or select an agency",
      });
      return;
    }

    await searchSubAwards({
      cfdaNumber,
      keywords,
      startDate,
      endDate,
      state,
      agencies,
    });
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
                Sub-Award Intelligence
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
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
      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Description */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Search Federal Sub-Awards
          </h2>
          <p className="text-muted-foreground">
            Search for sub-awards by CFDA number or keywords. This searches
            directly against USAspending.gov's sub-award database.
          </p>
        </div>

        {/* Search Form */}
        <SubAwardSearchForm
          ref={formRef}
          onSearch={handleSearch}
          loading={searching}
          savedSearches={savedSearches}
          onSaveSearch={saveSearch}
          onDeleteSearch={deleteSearch}
          savedSearchesLoading={savedSearchesLoading}
        />

        {/* Results Table */}
        <SubAwardResultsTable
          results={results}
          total={total}
          loading={searching}
          page={page}
          hasNext={hasNext}
          onNextPage={() => goToPage(page + 1)}
          onPrevPage={() => goToPage(page - 1)}
          onClear={clearResults}
        />
      </main>
    </div>
  );
}
