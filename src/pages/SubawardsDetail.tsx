import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StateSelector } from "@/components/StateSelector";
import { DateRangeSlider } from "@/components/DateRangeSlider";
import { PrimeAwardSubawards } from "@/components/PrimeAwardSubawards";

export default function SubawardsDetail() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().getFullYear() - 2, 0, 1),
    new Date(),
  ]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Subaward Details</h1>
          <p className="mt-2 text-muted-foreground">
            View prime awards and their associated subaward recipients
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Filter prime awards and subawards by state and date range
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <StateSelector
              value={selectedState}
              onChange={setSelectedState}
            />
            <DateRangeSlider
              startDate={dateRange[0]}
              endDate={dateRange[1]}
              onStartDateChange={(date) => date && setDateRange([date, dateRange[1]])}
              onEndDateChange={(date) => date && setDateRange([dateRange[0], date])}
            />
          </CardContent>
        </Card>

        <PrimeAwardSubawards
          state={selectedState}
          startDate={dateRange[0]}
          endDate={dateRange[1]}
        />
      </div>
    </div>
  );
}
