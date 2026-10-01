import { DOCUMENT_STATUS_LABEL, CUSTOMER_STATUS_LABEL, type CustomerStatus, type DocumentStatus } from "@organo/shared";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const DOC_VARIANT: Record<DocumentStatus, BadgeProps["variant"]> = {
  DRAFT: "secondary",
  SENT: "info",
  VIEWED: "info",
  NEGOTIATING: "warning",
  ACCEPTED: "success",
  REJECTED: "error",
  EXPIRED: "secondary",
  CONVERTED: "success",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "error",
  CANCELLED: "secondary",
};

export function StatusBadge({ status, size = "default" }: { status: DocumentStatus; size?: BadgeProps["size"] }) {
  return (
    <Badge variant={DOC_VARIANT[status]} size={size} className={status === "CANCELLED" ? "line-through" : undefined}>
      {DOCUMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

const CUSTOMER_VARIANT: Record<CustomerStatus, BadgeProps["variant"]> = {
  LEAD: "secondary",
  QUOTED: "outline",
  PROFORMA_SENT: "info",
  NEGOTIATING: "warning",
  CONFIRMED: "success",
  INVOICE_SENT: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  COMPLETED: "success",
  INACTIVE: "secondary",
};

export function CustomerStatusBadge({ status, size = "default" }: { status: CustomerStatus; size?: BadgeProps["size"] }) {
  return (
    <Badge variant={CUSTOMER_VARIANT[status]} size={size}>
      {CUSTOMER_STATUS_LABEL[status]}
    </Badge>
  );
}
