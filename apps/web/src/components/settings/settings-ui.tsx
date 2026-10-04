"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  children,
  footer,
  loading,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-5 py-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="grid gap-4 px-5 py-5">
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          children
        )}
      </div>
      {footer && <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>}
    </section>
  );
}

export function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <>
      <span className="mr-auto text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Discard
        </Button>
      )}
      <Button size="sm" disabled={!dirty} loading={saving} onClick={onSave}>
        Save changes
      </Button>
    </>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  className,
  multiline,
  rows = 3,
  ...props
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <label className={cn("grid content-start gap-1.5 text-sm font-medium", className)}>
      {label}
      {multiline ? (
        <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} className="font-normal" aria-invalid={!!error || undefined} />
      ) : (
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} {...props} />
      )}
      {error ? <span className="text-xs font-normal text-destructive-foreground">{error}</span> : hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function SwitchField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
