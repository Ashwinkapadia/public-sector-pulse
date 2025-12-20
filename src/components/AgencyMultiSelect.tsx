import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const AGENCIES = [
  "Department of Health and Human Services",
  "Department of Justice",
  "Department of Homeland Security",
  "Department of Education",
  "Department of Labor",
  "Department of Housing and Urban Development",
  "Department of Veterans Affairs",
  "Department of Transportation",
  "Department of the Treasury",
  "Small Business Administration",
] as const;

export type Agency = (typeof AGENCIES)[number];

interface AgencyMultiSelectProps {
  value: Agency[];
  onChange: (agencies: Agency[]) => void;
}

export function AgencyMultiSelect({ value, onChange }: AgencyMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const allSelected = value.length === AGENCIES.length;
  const noneSelected = value.length === 0;

  const handleToggleAgency = (agency: Agency) => {
    if (value.includes(agency)) {
      onChange(value.filter((a) => a !== agency));
    } else {
      onChange([...value, agency]);
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...AGENCIES]);
    }
  };

  const handleRemoveAgency = (agency: Agency) => {
    onChange(value.filter((a) => a !== agency));
  };

  const getDisplayText = () => {
    if (noneSelected) return "Select agencies...";
    if (allSelected) return "All agencies selected";
    if (value.length === 1) return value[0];
    return `${value.length} agencies selected`;
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
          >
            <span className="truncate">{getDisplayText()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0 z-50" align="start">
          <div className="p-2 border-b">
            <div
              className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
              onClick={handleSelectAll}
            >
              <Checkbox
                checked={allSelected}
                className="pointer-events-none"
              />
              <span className="font-medium">Select All</span>
            </div>
          </div>
          <ScrollArea className="h-[280px]">
            <div className="p-2">
              {AGENCIES.map((agency) => (
                <div
                  key={agency}
                  className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                  onClick={() => handleToggleAgency(agency)}
                >
                  <Checkbox
                    checked={value.includes(agency)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{agency}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface AgencyBadgesProps {
  agencies: Agency[];
  onRemove: (agency: Agency) => void;
}

export function AgencyBadges({ agencies, onRemove }: AgencyBadgesProps) {
  if (agencies.length === 0 || agencies.length === AGENCIES.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {agencies.map((agency) => (
        <Badge
          key={agency}
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span className="text-xs truncate max-w-[200px]">{agency}</span>
          <button
            type="button"
            onClick={() => onRemove(agency)}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export { AGENCIES };
