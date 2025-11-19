import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RepAssignment {
  id: string;
  organization_id: string;
  rep_id: string;
  assigned_at: string;
  notes: string | null;
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
  };
}

export function useRepAssignments() {
  return useQuery({
    queryKey: ["rep-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rep_assignments")
        .select(`
          *,
          profiles!rep_assignments_rep_id_fkey (
            id,
            display_name,
            email
          )
        `);

      if (error) throw error;
      return data as RepAssignment[];
    },
  });
}

export function useAssignRep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      repId,
      notes,
    }: {
      organizationId: string;
      repId: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("rep_assignments")
        .upsert({
          organization_id: organizationId,
          rep_id: repId,
          assigned_by: user?.id,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rep-assignments"] });
      toast.success("Rep assigned successfully");
    },
    onError: (error) => {
      toast.error(`Failed to assign rep: ${error.message}`);
    },
  });
}

export function useUnassignRep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await supabase
        .from("rep_assignments")
        .delete()
        .eq("organization_id", organizationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rep-assignments"] });
      toast.success("Rep unassigned successfully");
    },
    onError: (error) => {
      toast.error(`Failed to unassign rep: ${error.message}`);
    },
  });
}
