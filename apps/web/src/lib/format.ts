import { formatDistanceToNowStrict } from "date-fns";
import { formatDisplayDate } from "@organo/shared";

export const fmtDate = (d: string | Date | null | undefined) => formatDisplayDate(d ?? null);

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${formatDisplayDate(date)}, ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
}

export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  if (Math.abs(diff) < 60_000) return "just now";
  return diff > 0 ? `${formatDistanceToNowStrict(date)} ago` : `in ${formatDistanceToNowStrict(date)}`;
}

/** yyyy-mm-dd in India time, for <input type="date"> */
export function isoDay(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
