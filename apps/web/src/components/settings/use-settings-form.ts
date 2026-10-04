"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { api, ApiClientError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Settings } from "@/lib/types";

/**
 * Local edit buffer for one settings section. Only changed keys are sent, so two
 * people editing different sections don't overwrite each other.
 */
export function useSettingsForm<K extends keyof Settings>(keys: readonly K[]) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [edits, setValues] = useState<Pick<Settings, K> | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const initial = useMemo(() => (settings ? (Object.fromEntries(keys.map((k) => [k, settings[k]])) as Pick<Settings, K>) : null), [settings, keys]);
  // Untouched forms show the server values; the first edit starts a local copy.
  const values = edits ?? initial;

  const changed = useMemo(() => {
    if (!initial || !values) return {} as Partial<Pick<Settings, K>>;
    return Object.fromEntries(keys.filter((k) => JSON.stringify(values[k]) !== JSON.stringify(initial[k])).map((k) => [k, values[k]])) as Partial<Pick<Settings, K>>;
  }, [initial, values, keys]);
  const dirty = Object.keys(changed).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => {
      // Empty strings mean "clear this field".
      const body = Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v === "" ? null : v]));
      return api.patch<Settings>("/settings", body);
    },
    onSuccess: (s) => {
      qc.setQueryData(["settings"], (old: Settings | undefined) => ({ ...(old ?? s), ...s }));
      setValues(null);
      setErrors({});
      toast.success("Settings saved");
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.errors) setErrors(e.errors);
      toast.error(e);
    },
  });

  const set = <F extends K>(k: F, v: Settings[F]) => setValues((p) => {
    const base = p ?? initial;
    return base ? { ...base, [k]: v } : base;
  });
  const reset = () => setValues(null);
  return { values, set, dirty, save, reset, errors, isLoading: isLoading || !values, settings };
}
