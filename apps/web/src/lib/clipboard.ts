import { toast } from "./toast";

/** Copy text with feedback. Falls back when the Clipboard API is blocked (permissions, iframes, http). */
export async function copyText(text: string, successTitle = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successTitle, text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    if (ok) toast.success(successTitle, text);
    else toast.warning("Couldn't copy automatically", `Copy it from here: ${text}`);
    return ok;
  }
}
