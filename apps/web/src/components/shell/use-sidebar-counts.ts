"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Counts {
  followupsDue: number;
}

/** Small badge counts for the sidebar. Real numbers from the API, refreshed every minute. */
export function useSidebarCounts(): Counts {
  const { data } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: () => api.get<Counts>("/followups/counts/sidebar"),
    refetchInterval: 60_000,
    retry: false,
  });
  return data ?? { followupsDue: 0 };
}
