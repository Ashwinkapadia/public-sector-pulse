import { Badge } from "@/components/ui/badge";
import { useGrantTypes } from "@/hooks/useGrantTypes";
import { Skeleton } from "@/components/ui/skeleton";

interface GrantTypesFilterProps {
  selectedGrantType: string | null;
  onSelectGrantType: (grantTypeId: string | null) => void;
}

export const GrantTypesFilter = ({
  selectedGrantType,
  onSelectGrantType,
}: GrantTypesFilterProps) => {
  const { data: grantTypes, isLoading } = useGrantTypes();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Filter by Grant Type</h3>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!grantTypes || grantTypes.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Filter by Grant Type</h3>
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={selectedGrantType === null ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => onSelectGrantType(null)}
        >
          All
        </Badge>
        {grantTypes.map((grantType) => (
          <Badge
            key={grantType.id}
            variant={selectedGrantType === grantType.id ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => onSelectGrantType(grantType.id)}
          >
            {grantType.name}
          </Badge>
        ))}
      </div>
    </div>
  );
};
