import { Skeleton } from "@/components/ui/skeleton";

// Shown the instant a link is clicked, while the next page's code loads.
export default function Loading() {
  return (
    <div className="grid gap-4 p-4 md:p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
