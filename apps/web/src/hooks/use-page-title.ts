"use client";

import { useEffect } from "react";

/** Client pages that load their subject (a document, customer, product) set the tab title once known. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Organo Healers`;
  }, [title]);
}
