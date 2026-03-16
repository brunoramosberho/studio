import { useQuery } from "@tanstack/react-query";
import type { UserPackageWithDetails } from "@/types";

export function usePackages(enabled: boolean = true) {
  const query = useQuery<UserPackageWithDetails[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) throw new Error("Failed to fetch packages");
      return res.json();
    },
    enabled,
    retry: false,
  });

  return {
    packages: query.data ?? [],
    isLoading: query.isLoading && enabled,
  };
}
