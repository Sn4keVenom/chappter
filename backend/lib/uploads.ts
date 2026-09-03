// backend/lib/uploads.ts
//
// Plain local-disk file storage — not object storage (S3, R2, etc.). This is
// a self-hosted, single-box deployment (see the deploy guide): the uploads
// directory lives in its own named Docker volume (docker-compose.yml
// `uploads_data`), which survives an image rebuild the same way the
// database's volume does. If this ever moves to a multi-box or cloud
// deployment, this file is the one place that changes — every caller only
// ever sees a StoredFile, never a raw path.
//
// Used by documents.routes.ts (chapter documents) and finance.routes.ts
// (reimbursement receipts) — same size cap and MIME allowlist for both,
// since both are "an officer or member attaches a document/photo," not
// fundamentally different problems.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import type { Request } from "express";

// Defaults to a relative path so `npm run dev` outside Docker still works
// (creates ./uploads next to wherever the process runs from) — the
// production container always sets this explicitly (docker-compose.yml) to
// the mounted volume.
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — matches the avatar upload's own cap

// Deliberately narrow: documents and receipts are meant to be read back
// by a browser inline or downloaded, not executed. No SVG (XSS via inline
// script in an "image"), no HTML, no arbitrary octet-stream.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error("That file type isn't supported. Try a PDF, image, Word/Excel doc, or plain text file."));
    return;
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // Random name on disk, not the original filename — sidesteps path
  // traversal and collisions entirely rather than trying to sanitize a
  // user-supplied name. The real filename is preserved separately (the
  // caller stores file.originalname on its own row) for display/download.
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10); // bounded — a malicious "extension" can't blow this up
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/** One file, field name "file" — the shape both upload routes use. */
export const uploadSingleFile = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
}).single("file");

export interface StoredFile {
  /** Filename on disk under UPLOAD_DIR — what a DB row should store, never
   * exposed to the client directly (routes stream by resource id instead,
   * so access control is enforced on every read, not just upload). */
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export function storedFileFrom(file: Express.Multer.File): StoredFile {
  return {
    storedName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

export function uploadedFilePath(storedName: string): string {
  return path.join(UPLOAD_DIR, storedName);
}

export async function deleteUploadedFile(storedName: string | null | undefined): Promise<void> {
  if (!storedName) return;
  try {
    await fs.promises.unlink(uploadedFilePath(storedName));
  } catch (err: any) {
    // Already gone (or never existed) is fine — deleting the DB row is
    // still the right outcome either way. Anything else is worth knowing
    // about without failing the request over a file that's beside the point.
    if (err?.code !== "ENOENT") console.error(`[Chappter] Couldn't delete upload ${storedName}:`, err);
  }
}
