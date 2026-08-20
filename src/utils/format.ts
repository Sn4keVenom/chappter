// src/utils/format.ts
//
// Date and label formatting shared across pages. The mobile app duplicated
// most of these inside individual screens; centralizing them keeps "Sat, Aug
// 22 at 10:00 AM" identical everywhere it appears.
//
// All of these use the browser's locale rather than a hard-coded en-US
// format, so a user with a 24-hour clock or a D/M/Y locale gets their own
// conventions.

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatEventWhen(iso: string): string {
  return `${formatEventDate(iso)} at ${formatTime(iso)}`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "today" / "yesterday" / "6d ago" — for announcement and message stamps. */
export function formatRelativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/** "5m" / "3h" / "2d" — compact stamp for message and channel lists. */
export function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

/** SUPER_ADMIN → "Super Admin", VICE_REGENT → "Vice Regent". */
export function titleCaseEnum(value?: string | null): string {
  if (!value) return "";
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

/** Datetime-local input values are local-time and have no timezone suffix. */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
