// src/utils/calendar.ts
//
// Calendar integration (spec §7) — three independent export paths, all
// client-side only (no backend endpoint, no schema change):
//   · Google Calendar / Outlook Calendar — web "add event" URLs opened via
//     Linking, no native permission needed.
//   · Apple Calendar (and any other device calendar app) — a real, working
//     integration using expo-calendar: requests calendar permission, then
//     creates an actual event on-device. This is NOT a demo-mode stand-in;
//     it works identically in Demo Mode and a real backend build, since it
//     only touches the OS calendar, never the app's own data layer.
//   · Universal ICS export — for anything else (email a .ics, etc.) via
//     the OS share sheet.
//
// "Sync" in the product-spec sense (a live Google Calendar feed that stays
// updated) is NOT implemented — see docs/DEMO_MODE.md for what a real
// two-way sync would need (OAuth, a background job, webhook subscriptions).
// This module only covers one-shot "add this event" exports, which is what
// the UI actually offers.

import { Platform, Share } from "react-native";
import * as Calendar from "expo-calendar";
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
  const uid = `${Date.now()}@chapterhub`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChapterHub//EN",
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

/** Share the event as a universal .ics payload via the OS share sheet. */
export async function shareIcs(event: CalendarEventInput): Promise<void> {
  await Share.share({
    title: event.title,
    message: buildIcsContent(event),
  });
}

/**
 * Add directly to the device's calendar app (Apple Calendar on iOS, the
 * default calendar app on Android) via expo-calendar. Requests permission
 * on first use; picks the device's default writable calendar.
 */
export async function addToDeviceCalendar(event: CalendarEventInput): Promise<void> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Calendar permission was not granted.");
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCalendar =
    calendars.find((c) => c.allowsModifications && c.source?.name === (Platform.OS === "ios" ? "Default" : undefined)) ??
    calendars.find((c) => c.allowsModifications);

  if (!defaultCalendar) {
    throw new Error("No writable calendar was found on this device.");
  }

  await Calendar.createEventAsync(defaultCalendar.id, {
    title: event.title,
    notes: event.description ?? undefined,
    location: event.location ?? undefined,
    startDate: new Date(event.startTime),
    endDate: new Date(event.endTime),
    timeZone: undefined,
  });
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
