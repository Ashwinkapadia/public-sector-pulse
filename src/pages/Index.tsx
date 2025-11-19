import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StateSelector } from "@/components/StateSelector";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DateRangeSlider } from "@/components/DateRangeSlider";
import { FundingMetrics } from "@/components/FundingMetrics";
import { FundingChart } from "@/components/FundingChart";
import { FundingTable } from "@/components/FundingTable";
import { DataSources } from "@/components/DataSources";
import { BonterraLogo } from "@/components/BonterraLogo";

const Index = () => {
  const [selectedState, setSelectedState] = useState<string>();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

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
        {/* Filters Section */}
        <section className="mb-8">
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-6 text-foreground">
              Filter Data
            </h2>
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
          </div>
        </section>

        {/* Metrics Overview */}
        <section className="mb-8">
          <FundingMetrics state={selectedState} />
        </section>

        {/* Funding Chart */}
        <section className="mb-8">
          <FundingChart state={selectedState} />
        </section>

        {/* Organizations Table */}
        <section className="mb-8">
          <FundingTable state={selectedState} />
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
