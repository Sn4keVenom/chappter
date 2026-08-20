// src/pages/documents/categories.ts
//
// Shared between the documents index and a single category page, so the label
// shown in the list matches the heading you land on.

import type { DocumentCategory } from "../../types";

export const DOCUMENT_CATEGORIES: { key: DocumentCategory; label: string; icon: string }[] = [
  { key: "CONSTITUTION", label: "Constitution", icon: "📜" },
  { key: "BYLAWS", label: "Bylaws", icon: "📘" },
  { key: "MEETING_MINUTES", label: "Meeting Minutes", icon: "🗒" },
  { key: "RECRUITMENT", label: "Recruitment", icon: "🎯" },
  { key: "FORMS", label: "Forms", icon: "📋" },
  { key: "OFFICER_RESOURCES", label: "Officer Resources", icon: "🗂" },
  { key: "OTHER", label: "Other", icon: "📎" },
];

export function categoryLabel(key: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key)?.label ?? "Documents";
}
