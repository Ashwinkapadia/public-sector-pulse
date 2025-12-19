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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Search, Loader2, CalendarIcon, Save, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SavedSubawardSearch } from "@/hooks/useSavedSubawardSearches";
import { StateSelector } from "@/components/StateSelector";

interface SubAwardSearchFormProps {
  onSearch: (
    cfdaNumber: string,
    keywords: string,
    startDate: string,
    endDate: string,
    state: string
  ) => void;
  loading: boolean;
  savedSearches: SavedSubawardSearch[];
  onSaveSearch: (
    name: string,
    cfdaNumber: string,
    keywords: string,
    startDate: string,
    endDate: string,
    state: string
  ) => Promise<boolean>;
  onDeleteSearch: (id: string) => Promise<boolean>;
  savedSearchesLoading: boolean;
}

export function SubAwardSearchForm({
  onSearch,
  loading,
  savedSearches,
  onSaveSearch,
  onDeleteSearch,
  savedSearchesLoading,
}: SubAwardSearchFormProps) {
  const [cfdaNumber, setCfdaNumber] = useState("");
  const [keywords, setKeywords] = useState("");
  const [state, setState] = useState("ALL");
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date("2024-01-01")
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    new Date("2024-12-31")
  );
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(
      cfdaNumber,
      keywords,
      startDate ? format(startDate, "yyyy-MM-dd") : "2024-01-01",
      endDate ? format(endDate, "yyyy-MM-dd") : "2024-12-31",
      state
    );
  };

  const handleSave = async () => {
    if (!searchName.trim()) return;
    setSaving(true);
    const success = await onSaveSearch(
      searchName,
      cfdaNumber,
      keywords,
      startDate ? format(startDate, "yyyy-MM-dd") : "2024-01-01",
      endDate ? format(endDate, "yyyy-MM-dd") : "2024-12-31",
      state
    );
    setSaving(false);
    if (success) {
      setSaveDialogOpen(false);
      setSearchName("");
    }
  };

  const handleLoadSearch = (search: SavedSubawardSearch) => {
    setCfdaNumber(search.cfda_number || "");
    setKeywords(search.keywords || "");
    setState(search.state || "ALL");
    if (search.start_date) {
      setStartDate(new Date(search.start_date));
    }
    if (search.end_date) {
      setEndDate(new Date(search.end_date));
    }
  };

  const canSave = cfdaNumber.trim() || keywords.trim();

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="space-y-2">
              <Label>State/Location</Label>
              <StateSelector value={state} onChange={setState} />
              <p className="text-xs text-muted-foreground">
                Filter by place of performance
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Load Saved Search */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={savedSearchesLoading}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Load Search
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {savedSearches.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No saved searches yet
                    </div>
                  ) : (
                    <>
                      <DropdownMenuLabel>Saved Searches</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {savedSearches.map((search) => (
                        <DropdownMenuItem
                          key={search.id}
                          className="flex items-center justify-between group"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <span
                            className="flex-1 cursor-pointer truncate"
                            onClick={() => handleLoadSearch(search)}
                          >
                            {search.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSearch(search.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Save Search Dialog */}
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={!canSave}
                  >
                    <Save className="h-4 w-4" />
                    Save Search
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Search</DialogTitle>
                    <DialogDescription>
                      Save your current search criteria for quick access later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="search-name">Search Name</Label>
                      <Input
                        id="search-name"
                        placeholder="e.g., Medicaid Sub-Awards 2024"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        <strong>CFDA:</strong> {cfdaNumber || "Not specified"}
                      </p>
                      <p>
                        <strong>Keywords:</strong> {keywords || "Not specified"}
                      </p>
                      <p>
                        <strong>State:</strong> {state === "ALL" ? "All states" : state || "Not specified"}
                      </p>
                      <p>
                        <strong>Date Range:</strong>{" "}
                        {startDate ? format(startDate, "MMM d, yyyy") : "Start"} –{" "}
                        {endDate ? format(endDate, "MMM d, yyyy") : "End"}
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSaveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={!searchName.trim() || saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

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
