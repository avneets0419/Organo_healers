import type { Metadata } from "next";
import { CustomerList } from "@/components/customers/customer-list";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <CustomerList />;
}
