// src/pages/documents/DocumentsPage.tsx
//
// Document library index: one entry per chapter-managed folder with a live
// file count, plus the chapter's external links. Exec+ can add/rename/
// remove folders here, and add/remove links.

import { useState } from "react";
import { Link } from "react-router-dom";

import {
  createDocumentFolder,
  createExternalLink,
  deleteDocumentFolder,
  deleteExternalLink,
  listDocumentFolders,
  listExternalLinks,
  renameDocumentFolder,
} from "../../api/documents";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button, ExternalButtonLink } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import type { DocumentFolder } from "../../types";
import profileStyles from "../profile/ProfilePage.module.css";

export default function DocumentsPage() {
  const { can } = usePermissions();
  const canManage = can("documents.upload");

  const { data, loading, error, reload } = useAsync(async () => {
    const [folders, links] = await Promise.all([listDocumentFolders(), listExternalLinks()]);
    return { folders, links };
  }, []);

  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentFolder | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

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

  function openNewFolder() {
    setEditingFolder(null);
    setFolderName("");
    setFolderDialogOpen(true);
  }

  function openRenameFolder(folder: DocumentFolder) {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Documents" subtitle="Chapter files, forms, and useful links." />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section
        title="Folders"
        actions={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={openNewFolder}>
              + New folder
            </Button>
          ) : undefined
        }
      >
        <Card>
          {(data?.folders ?? []).length === 0 ? (
            <EmptyState
              icon="📁"
              title="No folders yet"
              body={canManage ? "Create one to start uploading files." : undefined}
              action={
                canManage ? (
                  <Button variant="primary" size="sm" onClick={openNewFolder}>
                    + New folder
                  </Button>
                ) : undefined
              }
            />
          ) : (
            (data?.folders ?? []).map((folder) => (
              <div key={folder.id} className={profileStyles.row}>
                <Link to={`/documents/folders/${folder.id}`} className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>📁 {folder.name}</span>
                  <span className={profileStyles.rowMeta}>
                    {folder.documentCount} file{folder.documentCount === 1 ? "" : "s"}
                  </span>
                </Link>
                {canManage ? (
                  <>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => openRenameFolder(folder)}>
                      Rename
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setDeleteTarget(folder)}>
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </Section>

      <Section
        title="Useful links"
        actions={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setAddLinkOpen(true)}>
              + Add link
            </Button>
          ) : undefined
        }
      >
        <Card>
          {(data?.links ?? []).length === 0 ? (
            <EmptyState icon="🔗" title="No links yet" />
          ) : (
            (data?.links ?? []).map((link) => (
              <div key={link.id} className={profileStyles.row}>
                <span className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>{link.label}</span>
                  <span className={profileStyles.rowMeta}>{link.url}</span>
                </span>
                <ExternalButtonLink href={link.url} size="sm" variant="secondary">
                  Open
                </ExternalButtonLink>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => mutate(() => deleteExternalLink(link.id), "Couldn't remove the link.")}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </Section>

      <Dialog
        open={addLinkOpen}
        onClose={() => setAddLinkOpen(false)}
        title="Add a link"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddLinkOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!label.trim() || !url.trim()}
              onClick={async () => {
                setAddLinkOpen(false);
                await mutate(
                  () => createExternalLink({ label: label.trim(), url: url.trim() }),
                  "Couldn't add the link."
                );
                setLabel("");
                setUrl("");
              }}
            >
              Add link
            </Button>
          </>
        }
      >
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pyli — Dues Payments" autoFocus />
        <Input label="URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoCapitalize="none" />
      </Dialog>

      <Dialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        title={editingFolder ? "Rename folder" : "New folder"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFolderDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!folderName.trim()}
              onClick={async () => {
                setFolderDialogOpen(false);
                await mutate(
                  () =>
                    editingFolder
                      ? renameDocumentFolder(editingFolder.id, folderName.trim())
                      : createDocumentFolder(folderName.trim()),
                  editingFolder ? "Couldn't rename the folder." : "Couldn't create the folder."
                );
              }}
            >
              {editingFolder ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <Input
          label="Folder name"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="Meeting Minutes"
          autoFocus
        />
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget &&
          mutate(() => deleteDocumentFolder(deleteTarget.id), "Couldn't delete the folder.", () =>
            setDeleteTarget(null)
          )
        }
        title="Delete this folder?"
        body={`${deleteTarget?.name} will be removed. Its ${deleteTarget?.documentCount ?? 0} file${deleteTarget?.documentCount === 1 ? "" : "s"} aren't deleted — they just won't be in a folder anymore.`}
        confirmLabel="Delete"
        destructive
        busy={busy}
      />
    </div>
  );
}
