// src/pages/documents/DocumentCategoryPage.tsx
//
// Files within one folder. Real upload — lib/uploads.ts on the backend,
// local disk under a Docker volume (this is a single-box self-hosted
// deployment, not object storage). The route param is still named
// `category` (kept from before folders existed) but is really a folder id.

import { useRef, useState } from "react";
import { useParams } from "react-router-dom";

import {
  deleteDocument,
  listDocumentFolders,
  listDocuments,
  openDocumentFile,
  uploadDocument,
} from "../../api/documents";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { formatFullDate } from "../../utils/format";
import profileStyles from "../profile/ProfilePage.module.css";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches lib/uploads.ts's server-side cap

function formatBytes(bytes?: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentCategoryPage() {
  const { folderId = "" } = useParams();
  const { can } = usePermissions();
  const canUpload = can("documents.upload");
  const canDelete = can("documents.delete");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [documents, folders] = await Promise.all([
      listDocuments({ folderId }),
      listDocumentFolders(),
    ]);
    return { documents, folderName: folders.find((f) => f.id === folderId)?.name ?? "Documents" };
  }, [folderId]);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function mutate(action: () => Promise<unknown>, failure: string, onDone?: () => void) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      onDone?.();
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? failure);
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    setAddOpen(false);
    setName("");
    setFile(null);
  }

  function handleFilePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = ""; // lets picking the same file again re-fire onChange
    if (!picked) return;
    if (picked.size > MAX_UPLOAD_BYTES) {
      setActionError("That file is too large — choose one under 15MB.");
      return;
    }
    setActionError(null);
    setFile(picked);
    // Default the name to the filename minus its extension, editable below —
    // saves retyping "Spring 2027 Bylaws.pdf" as both the file AND the name.
    if (!name.trim()) setName(picked.name.replace(/\.[^./]+$/, ""));
  }

  async function openFile(documentId: string) {
    setOpeningId(documentId);
    setActionError(null);
    try {
      await openDocumentFile(documentId);
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't open that file.");
    } finally {
      setOpeningId(null);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={data?.folderName ?? "Documents"}
        backTo="/documents"
        backLabel="Documents"
        actions={
          canUpload ? (
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              + Upload file
            </Button>
          ) : undefined
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Card>
        {(data?.documents ?? []).length === 0 ? (
          <EmptyState icon="📄" title="No documents here yet" />
        ) : (
          (data?.documents ?? []).map((document) => (
            <div key={document.id} className={profileStyles.row}>
              <button
                type="button"
                className={profileStyles.rowBody}
                style={{ textAlign: "left", background: "none", border: "none", cursor: document.storedFileName ? "pointer" : "default" }}
                disabled={!document.storedFileName || openingId === document.id}
                onClick={() => document.storedFileName && openFile(document.id)}
              >
                <span className={profileStyles.rowTitle}>
                  {document.storedFileName ? "📄 " : ""}
                  {document.name}
                  {openingId === document.id ? "…" : ""}
                </span>
                <span className={profileStyles.rowMeta}>
                  {document.fileLabel}
                  {formatBytes(document.sizeBytes) ? ` · ${formatBytes(document.sizeBytes)}` : ""} ·{" "}
                  {document.uploadedBy.firstName} {document.uploadedBy.lastName} · {formatFullDate(document.uploadedAt)}
                </span>
              </button>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => mutate(() => deleteDocument(document.id), "Couldn't remove the document.")}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))
        )}
      </Card>

      <Dialog
        open={addOpen}
        onClose={closeDialog}
        title="Upload a document"
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!name.trim() || !file}
              onClick={() =>
                file &&
                mutate(
                  () => uploadDocument({ name: name.trim(), folderId, file }),
                  "Couldn't upload the document.",
                  closeDialog
                )
              }
            >
              Upload
            </Button>
          </>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFilePick}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*"
          style={{ display: "none" }}
        />
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            {file ? "Change file" : "Choose file"}
          </Button>
          {file ? (
            <p style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              {file.name} ({formatBytes(file.size)})
            </p>
          ) : null}
        </div>
        <Input
          label="Document name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spring 2027 Bylaws"
          hint="Shown in the list — defaults to the filename."
        />
      </Dialog>
    </div>
  );
}
