import type { Metadata } from "next";
import { DocumentList } from "@/components/documents/document-list";

export const metadata: Metadata = { title: "Proformas" };

export default function ProformasPage() {
  return <DocumentList type="PROFORMA" />;
}
