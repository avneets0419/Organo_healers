"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { ApiClientError } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A waking database (503 DB_UNAVAILABLE) gets a few patient retries; other 4xx never retry.
            retry: (count, error) => {
              if (error instanceof ApiClientError && error.code === "DB_UNAVAILABLE") return count < 4;
              return !(error instanceof ApiClientError && error.status < 500) && count < 2;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <ToastProvider position="top-center">{children}</ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
