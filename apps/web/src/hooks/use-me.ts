"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  permissions: string[];
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), staleTime: 5 * 60_000 });
}

export function useCan(permission: string): boolean {
  const { data } = useMe();
  return !!data && (data.permissions.includes("*") || data.permissions.includes(permission));
}
