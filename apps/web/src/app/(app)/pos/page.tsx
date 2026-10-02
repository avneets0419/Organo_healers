import type { Metadata } from "next";
import { Suspense } from "react";
import { PosScreen } from "@/components/pos/pos-screen";

export const metadata: Metadata = { title: "POS" };

export default function PosPage() {
  return (
    <Suspense>
      <PosScreen />
    </Suspense>
  );
}
