import type { Metadata } from "next";
import { DocumentList } from "@/components/documents/document-list";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <DocumentList type="INVOICE" />;
}
