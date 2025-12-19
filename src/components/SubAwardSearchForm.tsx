import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2 } from "lucide-react";

interface SubAwardSearchFormProps {
  onSearch: (cfdaNumber: string, keywords: string) => void;
  loading: boolean;
}

export function SubAwardSearchForm({
  onSearch,
  loading,
}: SubAwardSearchFormProps) {
  const [cfdaNumber, setCfdaNumber] = useState("");
  const [keywords, setKeywords] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(cfdaNumber, keywords);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cfda">CFDA Number</Label>
              <Input
                id="cfda"
                placeholder="e.g., 93.778"
                value={cfdaNumber}
                onChange={(e) => setCfdaNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Catalog of Federal Domestic Assistance number
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                placeholder="e.g., Public Safety, Healthcare"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple keywords with commas
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search Sub-Awards
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
