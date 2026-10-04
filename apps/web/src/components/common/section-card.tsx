import type { ReactNode } from "react";
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Compact card used across the app (dense, app-like spacing). */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 rounded-xl py-0 before:rounded-[calc(var(--radius-xl)-1px)]", className)}>
      {(title || action) && (
        <CardHeader className="gap-1 px-4 pt-4 pb-3">
          {title && <CardTitle className="text-sm font-semibold">{title}</CardTitle>}
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardPanel className={cn("px-4 pb-4", !title && !action && "pt-4", bodyClassName)}>{children}</CardPanel>
    </Card>
  );
}
