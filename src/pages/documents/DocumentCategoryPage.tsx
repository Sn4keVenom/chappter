// src/pages/documents/DocumentCategoryPage.tsx
//
// Files within one category. "Upload" records a filename rather than storing
// a file — there is no object storage behind this yet, and an upload control
// that silently discards the file would be worse than an honest placeholder.

import { useState } from "react";
import { useParams } from "react-router-dom";

import { deleteDocument, listDocuments, uploadDocument } from "../../api/documents";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { categoryLabel } from "./categories";
import { formatFullDate } from "../../utils/format";
import type { DocumentCategory } from "../../types";
import profileStyles from "../profile/ProfilePage.module.css";

export default function DocumentCategoryPage() {
  const { category = "OTHER" } = useParams();
  const { can } = usePermissions();
  const canUpload = can("documents.upload");
  const canDelete = can("documents.delete");

  const { data, loading, error, reload } = useAsync(
    () => listDocuments({ category: category as DocumentCategory }),
    [category]
  );

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function mutate(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? failure);
    } finally {
      setBusy(false);
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
        title={categoryLabel(category)}
        backTo="/documents"
        backLabel="Documents"
        actions={
          canUpload ? (
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              + Add document
            </Button>
          ) : undefined
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon="📄" title="No documents here yet" />
        ) : (
          (data ?? []).map((document) => (
            <div key={document.id} className={profileStyles.row}>
              <span className={profileStyles.rowBody}>
                <span className={profileStyles.rowTitle}>{document.name}</span>
                <span className={profileStyles.rowMeta}>
                  {document.fileLabel}
                  {document.sizeLabel ? ` · ${document.sizeLabel}` : ""} · {document.uploadedBy.firstName}{" "}
                  {document.uploadedBy.lastName} · {formatFullDate(document.uploadedAt)}
                </span>
              </span>
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
        onClose={() => setAddOpen(false)}
        title="Add a document"
        subtitle="File storage isn't wired up yet — this records the document's name and where to find it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!name.trim() || !fileLabel.trim()}
              onClick={async () => {
                setAddOpen(false);
                await mutate(
                  () =>
                    uploadDocument({
                      category: category as DocumentCategory,
                      name: name.trim(),
                      fileLabel: fileLabel.trim(),
                    }),
                  "Couldn't add the document."
                );
                setName("");
                setFileLabel("");
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <Input label="Document name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 2027 Bylaws" autoFocus />
        <Input
          label="File reference"
          value={fileLabel}
          onChange={(e) => setFileLabel(e.target.value)}
          placeholder="bylaws_2027.pdf"
          hint="A filename or a note about where the file lives."
        />
      </Dialog>
    </div>
  );
}
