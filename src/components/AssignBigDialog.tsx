// src/components/AssignBigDialog.tsx
//
// Search → confirm picker for assigning a Big OR a Little. Two-step so a
// change that rewrites someone's lineage always gets a deliberate second
// action rather than firing on a single mis-tap in a list.
//
// Originally lived only in MemberProfilePage.tsx (an Exec+ admin assigning
// someone ELSE's Big, searching the full roster by name or email). Extracted
// so ProfilePage.tsx can reuse the same picker for self-service — a member
// choosing their own Big or a Little — which needs a different, narrower
// search: any chapter member can call GET /users/search (name + avatar
// only), but roster search (GET /users, name/email/role/status) stays
// Exec+. `search`/`showEmail` default to the original admin behavior, so
// MemberProfilePage's usage is unchanged; ProfilePage passes searchMembers
// and showEmail={false} instead.
//
// `role` only changes copy ("Big" vs "Little") — the caller decides what
// onAssign actually does (which membership gets updated, and in which
// direction), so the same component works for both "assign someone else's
// Big" and "claim someone as my Little" without knowing the difference.

import { useState } from "react";
import { getRoster } from "../api/users";
import { useAsync } from "../hooks/useAsync";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "./ui/Feedback";
import styles from "../pages/profile/ProfilePage.module.css";

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

type Step = { kind: "search" } | { kind: "confirm"; target: Candidate | null };

async function defaultSearch(q: string): Promise<Candidate[]> {
  const { users } = await getRoster({ q, limit: 15 });
  return users;
}

export function AssignBigDialog({
  open,
  role = "Big",
  memberName,
  currentAssigneeName,
  onClose,
  onAssign,
  search = defaultSearch,
  showEmail = true,
}: {
  open: boolean;
  /** Controls copy only — "Assign Big" vs "Add a Little", etc. What
   * onAssign actually does is entirely up to the caller. */
  role?: "Big" | "Little";
  memberName: string;
  /** The current Big's name (role="Big") to offer a "Remove" shortcut for.
   * Always null for role="Little" — a Littles list has no single slot to
   * show a removal option for here; removing an existing Little is a plain
   * action next to that entry in the list, not part of this picker. */
  currentAssigneeName: string | null;
  onClose: () => void;
  onAssign: (userId: string | null) => Promise<void>;
  search?: (q: string) => Promise<Candidate[]>;
  showEmail?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: results, loading } = useAsync(
    () => (open ? search(query) : Promise.resolve([])),
    [query, open, search]
  );

  // Reset whenever the dialog is reopened, so it never resumes mid-flow.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep({ kind: "search" });
      setQuery("");
      setError(null);
    }
  }

  async function commit(userId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onAssign(userId);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? `Couldn't assign ${role}.`);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "confirm") {
    const target = step.target;
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={target ? `Assign ${role}` : `Remove ${role}`}
        subtitle={
          target
            ? `${target.firstName} ${target.lastName} will become ${memberName}'s ${role}.`
            : `${memberName} will no longer have a ${role} assigned.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep({ kind: "search" })} disabled={busy}>
              Back
            </Button>
            <Button
              variant={target ? "primary" : "dangerSolid"}
              onClick={() => commit(target?.id ?? null)}
              busy={busy}
            >
              Confirm
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        {currentAssigneeName && target ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.55 }}>
            This replaces {currentAssigneeName} as {memberName}'s current {role}.
          </p>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Assign ${role}`}
      subtitle={`Choose a ${role} for ${memberName}.`}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Input
        label="Search members"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={showEmail ? "Name or email" : "Name"}
        autoComplete="off"
      />

      {currentAssigneeName ? (
        <Button
          variant="danger"
          block
          onClick={() => setStep({ kind: "confirm", target: null })}
          style={{ marginBottom: "var(--space-4)" }}
        >
          Remove {currentAssigneeName} as {role}
        </Button>
      ) : null}

      {loading ? (
        <LoadingState label="Searching…" />
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {(results ?? []).map((user) => (
            <button
              key={user.id}
              type="button"
              className={styles.row}
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => setStep({ kind: "confirm", target: user })}
            >
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  {user.firstName} {user.lastName}
                </span>
                {showEmail && user.email ? <span className={styles.rowMeta}>{user.email}</span> : null}
              </span>
            </button>
          ))}
          {(results ?? []).length === 0 && query.trim() ? (
            <EmptyState icon="🔍" title="No matches" />
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
