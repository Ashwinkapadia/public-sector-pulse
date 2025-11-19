import { useVerticals } from "@/hooks/useVerticals";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface VerticalsFilterProps {
  selectedVerticals: string[];
  onSelectVerticals: (verticals: string[]) => void;
}

export function VerticalsFilter({
  selectedVerticals,
  onSelectVerticals,
}: VerticalsFilterProps) {
  const { data: verticals, isLoading } = useVerticals();

  const handleToggleVertical = (verticalId: string) => {
    if (selectedVerticals.includes(verticalId)) {
      onSelectVerticals(selectedVerticals.filter((id) => id !== verticalId));
    } else {
      onSelectVerticals([...selectedVerticals, verticalId]);
    }
  };

  const handleRemoveVertical = (verticalId: string) => {
    onSelectVerticals(selectedVerticals.filter((id) => id !== verticalId));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading verticals...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Filter by Verticals</h3>
        {selectedVerticals.length > 0 && (
          <button
            onClick={() => onSelectVerticals([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected verticals badges */}
      {selectedVerticals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedVerticals.map((verticalId) => {
            const vertical = verticals?.find((v) => v.id === verticalId);
            if (!vertical) return null;
            return (
              <Badge key={verticalId} variant="secondary" className="gap-1">
                {vertical.name}
                <button
                  onClick={() => handleRemoveVertical(verticalId)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Vertical checkboxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {verticals?.map((vertical) => (
          <div key={vertical.id} className="flex items-center space-x-2">
            <Checkbox
              id={vertical.id}
              checked={selectedVerticals.includes(vertical.id)}
              onCheckedChange={() => handleToggleVertical(vertical.id)}
            />
            <Label
              htmlFor={vertical.id}
              className="text-sm font-normal cursor-pointer"
            >
              {vertical.name}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
