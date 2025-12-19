import { useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, Loader2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubAwardSearchFormProps {
  onSearch: (
    cfdaNumber: string,
    keywords: string,
    startDate: string,
    endDate: string
  ) => void;
  loading: boolean;
}

export function SubAwardSearchForm({
  onSearch,
  loading,
}: SubAwardSearchFormProps) {
  const [cfdaNumber, setCfdaNumber] = useState("");
  const [keywords, setKeywords] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date("2024-01-01")
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    new Date("2024-12-31")
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(
      cfdaNumber,
      keywords,
      startDate ? format(startDate, "yyyy-MM-dd") : "2024-01-01",
      endDate ? format(endDate, "yyyy-MM-dd") : "2024-12-31"
    );
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
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
