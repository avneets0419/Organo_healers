"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** True when focus is in a text field, so single-key shortcuts don't hijack typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "range"].includes(type);
  }
  return !!target.closest("[role=dialog] [contenteditable], [data-hotkeys-ignore]");
}

export interface Hotkey {
  /** e.g. "mod+k", "n", "/", "escape" */
  combo: string;
  handler: (e: KeyboardEvent) => void;
  /** Fire even while typing (for mod+ combos). Defaults to true for mod combos. */
  allowInInput?: boolean;
}

function matches(e: KeyboardEvent, combo: string) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop()!;
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  if (mod !== (e.metaKey || e.ctrlKey)) return false;
  if (shift !== e.shiftKey && key.length > 1) return false;
  if (alt !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  const ref = useRef(hotkeys);
  useLayoutEffect(() => {
    ref.current = hotkeys;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      for (const h of ref.current) {
        if (!matches(e, h.combo)) continue;
        const allow = h.allowInInput ?? h.combo.includes("mod");
        if (!allow && isTypingTarget(e.target)) continue;
        e.preventDefault();
        h.handler(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
