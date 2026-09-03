// src/api/documents.ts
//
// Documents, chapter-managed folders, and external links (spec §8). Real
// file upload/download — lib/uploads.ts on the backend, local disk under a
// Docker volume (self-hosted, single-box deployment, not object storage).

import { apiClient } from "./client";
import type { ChapterDocument, DocumentCategory, DocumentFolder, ExternalLink } from "../types";

export async function listDocuments(params?: {
  category?: DocumentCategory;
  folderId?: string;
}): Promise<ChapterDocument[]> {
  const { data } = await apiClient.get<{ documents: ChapterDocument[] }>("/documents", { params });
  return data.documents;
}

export async function listDocumentFolders(): Promise<DocumentFolder[]> {
  const { data } = await apiClient.get<{ folders: DocumentFolder[] }>("/document-folders");
  return data.folders;
}

export async function createDocumentFolder(name: string): Promise<DocumentFolder> {
  const { data } = await apiClient.post<{ folder: DocumentFolder }>("/document-folders", { name });
  return data.folder;
}

export async function renameDocumentFolder(id: string, name: string): Promise<DocumentFolder> {
  const { data } = await apiClient.patch<{ folder: DocumentFolder }>(`/document-folders/${id}`, { name });
  return data.folder;
}

/** Documents inside are NOT deleted — they fall back to "no folder." */
export async function deleteDocumentFolder(id: string): Promise<void> {
  await apiClient.delete(`/document-folders/${id}`);
}

/**
 * Real file upload — multipart/form-data, not JSON. The explicit
 * `Content-Type: undefined` override is required: apiClient sets
 * `application/json` as an instance-level default, which (unlike leaving
 * the header alone entirely) does NOT get automatically replaced by the
 * browser's own multipart boundary header unless this request clears it
 * first.
 */
export async function uploadDocument(payload: {
  name: string;
  folderId: string;
  file: File;
}): Promise<ChapterDocument> {
  const form = new FormData();
  form.append("name", payload.name);
  form.append("folderId", payload.folderId);
  form.append("file", payload.file);
  const { data } = await apiClient.post<{ document: ChapterDocument }>("/documents", form, {
    headers: { "Content-Type": undefined },
  });
  return data.document;
}

/**
 * Opens a document's real file in a new tab. Not a plain `<a href>` to
 * GET /documents/:id/file — that route needs the same Bearer auth every
 * other API call does (this app has no auth cookie, only a JWT the request
 * interceptor attaches), which a raw browser navigation never sends. Fetch
 * it through apiClient like any other request, then hand the browser a
 * local blob: URL to open instead.
 */
export async function openDocumentFile(id: string): Promise<void> {
  const response = await apiClient.get(`/documents/${id}/file`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  window.open(url, "_blank", "noopener");
  // Not revoked immediately — the new tab needs the URL to still be valid
  // once it finishes loading, which races an immediate revoke. It's one
  // small blob per open, cleaned up when this tab closes/reloads regardless.
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
