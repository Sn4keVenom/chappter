// src/api/documents.ts
//
// Documents & file management (spec §8) — folders/categories, file
// upload/download placeholders, and external links (Pyli, CMT, chapter/
// national websites). Demo mode stores only a placeholder filename, no
// real file storage — see mocks/seed.ts ChapterDocument doc comment.

import { apiClient } from "./client";
import type { ChapterDocument, DocumentCategory, ExternalLink } from "../types";

export async function listDocuments(params?: { category?: DocumentCategory }): Promise<ChapterDocument[]> {
  const { data } = await apiClient.get<{ documents: ChapterDocument[] }>("/documents", { params });
  return data.documents;
}

export async function uploadDocument(payload: {
  category: DocumentCategory;
  name: string;
  fileLabel: string;
}): Promise<ChapterDocument> {
  const { data } = await apiClient.post<{ document: ChapterDocument }>("/documents", payload);
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}`);
}

export async function listExternalLinks(): Promise<ExternalLink[]> {
  const { data } = await apiClient.get<{ links: ExternalLink[] }>("/links");
  return data.links;
}

export async function createExternalLink(payload: { label: string; url: string; category?: string }): Promise<ExternalLink> {
  const { data } = await apiClient.post<{ link: ExternalLink }>("/links", payload);
  return data.link;
}

export async function deleteExternalLink(id: string): Promise<void> {
  await apiClient.delete(`/links/${id}`);
}
