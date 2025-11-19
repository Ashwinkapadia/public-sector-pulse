import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { useReps } from "@/hooks/useProfiles";
import { useAssignRep } from "@/hooks/useRepAssignments";

interface AssignRepDialogProps {
  organizationId: string;
  organizationName: string;
  currentRepId?: string;
}

export function AssignRepDialog({ organizationId, organizationName, currentRepId }: AssignRepDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState<string>(currentRepId || "");
  const [notes, setNotes] = useState("");

  const { data: reps, isLoading: repsLoading } = useReps();
  const assignRep = useAssignRep();

  const handleAssign = async () => {
    if (!selectedRepId) return;

    await assignRep.mutateAsync({
      organizationId,
      repId: selectedRepId,
      notes,
    });

    setOpen(false);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          {currentRepId ? "Reassign" : "Assign Rep"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Sales Rep</DialogTitle>
          <DialogDescription>
            Assign a sales representative to {organizationName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rep">Sales Representative</Label>
            <Select value={selectedRepId} onValueChange={setSelectedRepId} disabled={repsLoading}>
              <SelectTrigger id="rep">
                <SelectValue placeholder="Select a rep" />
              </SelectTrigger>
              <SelectContent>
                {reps?.map((rep) => (
                  <SelectItem key={rep.id} value={rep.id}>
                    {rep.display_name || rep.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedRepId || assignRep.isPending}>
            {assignRep.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
