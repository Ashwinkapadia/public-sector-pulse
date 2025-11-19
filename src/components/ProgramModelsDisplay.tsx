import { Badge } from "@/components/ui/badge";
import { useFundingRecordProgramModels } from "@/hooks/useProgramModels";
import { Skeleton } from "@/components/ui/skeleton";

interface ProgramModelsDisplayProps {
  fundingRecordId: string;
}

export const ProgramModelsDisplay = ({
  fundingRecordId,
}: ProgramModelsDisplayProps) => {
  const { data: programModels, isLoading } = useFundingRecordProgramModels(fundingRecordId);

  if (isLoading) {
    return (
      <div className="flex gap-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  if (!programModels || programModels.length === 0) {
    return <span className="text-xs text-muted-foreground">No models assigned</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {programModels.map((item: any) => (
        <Badge key={item.id} variant="secondary" className="text-xs">
          {item.program_model?.name}
        </Badge>
      ))}
    </div>
  );
};
