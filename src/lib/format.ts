import { formatDistanceToNowStrict } from "date-fns";

export function formatRelativeTime(msEpoch: number): string {
  if (!msEpoch) return "—";
  return formatDistanceToNowStrict(new Date(msEpoch), { addSuffix: true });
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
