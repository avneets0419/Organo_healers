"use client";

import { ChevronDown, Copy, Mail, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import type { DocumentDetail } from "@/lib/types";
import { SendDialog, type SendMode } from "./send-dialog";

/**
 * One Send action with options. `ensureSaved` saves pending POS changes first and
 * returns the document id, so the message always links to the latest version.
 */
export function SendMenu({
  ensureSaved,
  disabled,
  size = "default",
}: {
  ensureSaved: () => Promise<string>;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const [mode, setMode] = useState<SendMode | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(m: SendMode) {
    setBusy(true);
    try {
      const id = await ensureSaved();
      setDocId(id);
      setMode(m);
    } catch (e) {
      // Save errors are already shown by the save mutation.
      if (!(e instanceof Error && e.name === "DraftValidationError")) console.debug(e);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setBusy(true);
    try {
      const id = await ensureSaved();
      const d = await api.get<DocumentDetail>(`/documents/${id}`);
      await copyText(d.publicUrl, "Link copied");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Group aria-label="Send">
        <Button size={size} disabled={disabled} loading={busy} onClick={() => open("both")}>
          <Send /> Send
        </Button>
        <GroupSeparator />
        <Menu>
          <MenuTrigger render={<Button size={size === "sm" ? "icon-sm" : "icon"} disabled={disabled || busy} aria-label="More send options" />}>
            <ChevronDown />
          </MenuTrigger>
          <MenuPopup align="end" className="w-56">
            <MenuItem onClick={() => open("both")}>
              <Send /> Email and WhatsApp
            </MenuItem>
            <MenuItem onClick={() => open("email")}>
              <Mail /> Email only
            </MenuItem>
            <MenuItem onClick={() => open("whatsapp")}>
              <MessageCircle /> WhatsApp only
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={copyLink}>
              <Copy /> Copy public link
            </MenuItem>
          </MenuPopup>
        </Menu>
      </Group>
      {docId && mode && <SendDialog documentId={docId} mode={mode} onClose={() => setMode(null)} />}
    </>
  );
}
