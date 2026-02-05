import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

interface UserProfile {
  id: string;
  userId: string;
  role: "internal" | "external" | "admin";
}

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
  profile?: UserProfile | null;
}

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      window.location.href = "/";
    },
  });

  // Helper to check if user has internal/admin privileges
  const isInternal = user?.profile?.role === "internal" || user?.profile?.role === "admin";

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isInternal,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
