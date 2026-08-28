// src/utils/calendar.ts
//
// Calendar integration (spec §7) — three independent export paths, all
// client-side only (no backend endpoint, no schema change):
//   · Google Calendar / Outlook Calendar — "add event" URLs opened in a
//     new tab.
//   · Universal ICS download — a real .ics file. Opening it hands the event
//     to whatever calendar app the operating system has registered (Apple
//     Calendar, Outlook desktop, Thunderbird…), which is the web equivalent
//     of the mobile build's direct expo-calendar write. This works
//     identically in Demo Mode and against a real backend, since it never
//     touches the app's own data layer.
//
// "Sync" in the product-spec sense (a live Google Calendar feed that stays
// updated) is NOT implemented — see docs/DEMO_MODE.md for what a real
// two-way sync would need (OAuth, a background job, webhook subscriptions).
// This module only covers one-shot "add this event" exports, which is what
// the UI actually offers.

import type { EventDetail } from "../types";

interface CalendarEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startTime: string;
  endTime: string;
}

function toGoogleDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toGoogleDate(event.startTime)}/${toGoogleDate(event.endTime)}`,
    details: event.description ?? "",
    location: event.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: new Date(event.startTime).toISOString(),
    enddt: new Date(event.endTime).toISOString(),
    body: event.description ?? "",
    location: event.location ?? "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

export function buildIcsContent(event: CalendarEventInput): string {
  const uid = `${Date.now()}@chappter`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chappter//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(event.startTime)}`,
    `DTEND:${toIcsDate(event.endTime)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.location ? `LOCATION:${escapeIcs(event.location)}` : "",
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

/**
 * Download the event as a .ics file.
 *
 * Replaces the mobile build's two separate paths (OS share sheet + a direct
 * expo-calendar write) with the one mechanism the web actually has. A blob
 * URL avoids embedding the whole calendar body in a data: URI, and the object
 * URL is revoked on the next tick so the blob does not leak for the lifetime
 * of the document.
 */
export function downloadIcs(event: CalendarEventInput): void {
  const blob = new Blob([buildIcsContent(event)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(event.title) || "event"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Share via the Web Share API where the browser supports it (most mobile
 * browsers), falling back to copying the event details to the clipboard.
 * Returns what actually happened so the caller can tell the user.
 */
export async function shareEvent(
  event: CalendarEventInput
): Promise<"shared" | "copied" | "unavailable"> {
  const text = [
    event.title,
    new Date(event.startTime).toLocaleString(),
    event.location ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet throws AbortError — that is a
      // cancellation, not a failure, so don't fall through to the clipboard.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  return "unavailable";
}

export function eventToCalendarInput(event: EventDetail): CalendarEventInput {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
  };
}
