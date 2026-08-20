// src/pages/documents/DocumentsPage.tsx
//
// Document library index: one entry per category with a live count, plus the
// chapter's external links. Exec+ can add and remove links here.

import { useState } from "react";
import { Link } from "react-router-dom";

import {
  createExternalLink,
  deleteExternalLink,
  listDocuments,
  listExternalLinks,
} from "../../api/documents";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button, ExternalButtonLink } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { DOCUMENT_CATEGORIES } from "./categories";
import profileStyles from "../profile/ProfilePage.module.css";

export default function DocumentsPage() {
  const { can } = usePermissions();
  const canManage = can("documents.upload");

  const { data, loading, error, reload } = useAsync(async () => {
    const [documents, links] = await Promise.all([listDocuments(), listExternalLinks()]);
    return { documents, links };
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  function countFor(key: string): number {
    return (data?.documents ?? []).filter((doc) => doc.category === key).length;
  }

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

  return (
    <div className="page page-narrow">
      <PageHeader title="Documents" subtitle="Chapter files, forms, and useful links." />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section title="Categories">
        <Card>
          {DOCUMENT_CATEGORIES.map((category) => (
            <Link key={category.key} to={`/documents/${category.key}`} className={profileStyles.row}>
              <span aria-hidden="true" style={{ fontSize: "var(--text-lg)" }}>
                {category.icon}
              </span>
              <span className={profileStyles.rowBody}>
                <span className={profileStyles.rowTitle}>{category.label}</span>
                <span className={profileStyles.rowMeta}>
                  {countFor(category.key)} file{countFor(category.key) === 1 ? "" : "s"}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
                ›
              </span>
            </Link>
          ))}
        </Card>
      </Section>

      <Section
        title="Useful links"
        actions={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
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
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a link"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!label.trim() || !url.trim()}
              onClick={async () => {
                setAddOpen(false);
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
    </div>
  );
}
