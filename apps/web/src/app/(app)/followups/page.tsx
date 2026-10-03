import type { Metadata } from "next";
import { Suspense } from "react";
import { FollowUpsView } from "@/components/followups/followups-view";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <Suspense>
      <FollowUpsView />
    </Suspense>
  );
}
