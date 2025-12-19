import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BonterraLogo } from "@/components/BonterraLogo";
import { SubAwardSearchForm } from "@/components/SubAwardSearchForm";
import { SubAwardResultsTable } from "@/components/SubAwardResultsTable";
import { useSubAwardSearch } from "@/hooks/useSubAwardSearch";

export default function SubAwards() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    loading: searching,
    results,
    total,
    searchSubAwards,
  } = useSubAwardSearch();

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

  const handleSearch = async (cfdaNumber: string, keywords: string) => {
    if (!cfdaNumber.trim() && !keywords.trim()) {
      toast({
        variant: "destructive",
        title: "Search Required",
        description: "Please enter a CFDA number or keywords",
      });
      return;
    }

    await searchSubAwards({
      cfdaNumber,
      keywords,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
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
        <SubAwardSearchForm onSearch={handleSearch} loading={searching} />

        {/* Results Table */}
        <SubAwardResultsTable
          results={results}
          total={total}
          loading={searching}
        />
      </main>
    </div>
  );
}
