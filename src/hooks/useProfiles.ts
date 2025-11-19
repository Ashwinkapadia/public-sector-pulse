import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'rep';
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("display_name");

      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useCurrentUserRole() {
  return useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) return null;
      return data?.role as 'admin' | 'rep' | null;
    },
  });
}

export function useReps() {
  return useQuery({
    queryKey: ["reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          profiles (
            id,
            display_name,
            email
          )
        `)
        .eq("role", "rep");

      if (error) throw error;
      return data.map(d => d.profiles).filter(Boolean) as Profile[];
    },
  });
}
