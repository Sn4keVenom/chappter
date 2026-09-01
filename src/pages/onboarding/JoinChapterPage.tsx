// src/pages/onboarding/JoinChapterPage.tsx
//
// Shown when a signed-in user has no chapter membership yet — never
// auto-assigned. Three ways in, all backed by the chapters API:
//
//   · redeem an invite code (pre-filled from ?code= so an invite link works
//     as a single click, which is what the QR codes in the invite manager
//     encode)
//   · browse chapters and request to join, which an admin approves
//   · (most PNM/Active/Alumni signups never reach this page at all — see
//     SignUpPage.tsx/VerifyEmailPage.tsx, which claim a matching roster entry
//     and file the join request automatically. This page is the fallback:
//     PNM signups always land here, and a verified signup that lost a
//     roster-claim race lands here too, with `error` in router state.)

import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { listChapters, redeemInviteCode, requestToJoinChapter } from "../../api/chapters";
import { useAsync } from "../../hooks/useAsync";
import { useAuthStore } from "../../store/useAuthStore";
import { AuthBanner, AuthField, AuthSubmit, authStyles } from "../auth/AuthForm";
import { Spinner } from "../../components/ui/Feedback";

export default function JoinChapterPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);

  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const locationState = location.state as { error?: string; status?: "ACTIVE" | "ALUMNI" | "PNM" } | null;
  const [error, setError] = useState<string | null>(locationState?.error ?? null);
  const [requested, setRequested] = useState<string | null>(null);
  // The status picked at sign-up (VerifyEmailPage forwards it here when a
  // roster claim didn't happen or didn't stick) — carried through to
  // requestJoin so approval doesn't fall back to "member but also PNM"
  // regardless of what was actually chosen. Absent for a cold browse/request
  // with no prior sign-up context, which is the one case that's supposed to
  // land as PNM by default.
  const pendingStatus = locationState?.status;

  const { data: chapters, loading } = useAsync(() => listChapters().catch(() => []), []);

  // An invite link lands here with the code already in the URL — surface it in
  // the field rather than making the user retype what they just clicked.
  useEffect(() => {
    const fromUrl = params.get("code");
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, [params]);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const user = await redeemInviteCode(code.trim().toUpperCase());
      setUser({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        hasChapter: user.hasChapter,
        chapterId: user.chapterId,
        role: user.role,
        office: user.office,
        status: user.status,
        roleNumber: user.roleNumber,
        major: user.major,
        graduationYear: user.graduationYear,
        committeeChairOf: user.committeeChairOf,
        teamId: user.teamId,
      });
    } catch (e: any) {
      setError(e?.message ?? "That code couldn't be redeemed. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestJoin(chapterId: string) {
    setBusy(true);
    setError(null);
    try {
      await requestToJoinChapter(chapterId, undefined, pendingStatus);
      setRequested(chapterId);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Join a chapter</h2>
      <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", opacity: 0.85 }}>
        Enter the invite code your chapter gave you, or ask to join below.
      </p>

      {error ? <AuthBanner>{error}</AuthBanner> : null}
      {requested ? (
        <p className={authStyles.notice} style={{ marginBottom: "var(--space-5)" }} role="status">
          Request sent. An officer will review it — you'll get access as soon as it's approved.
        </p>
      ) : null}

      <form onSubmit={redeem}>
        <AuthField
          label="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="RUSH2026"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{ letterSpacing: "0.16em", fontFamily: "var(--font-mono)" }}
        />
        <AuthSubmit disabled={!code.trim() || busy}>
          {busy ? "Checking…" : "Redeem code"}
        </AuthSubmit>
      </form>

      <h3 style={{ margin: "var(--space-8) 0 var(--space-3)", fontSize: "var(--text-md)" }}>
        Or request to join
      </h3>
      {pendingStatus && pendingStatus !== "PNM" ? (
        <p style={{ fontSize: "var(--text-xs)", opacity: 0.8, marginBottom: "var(--space-3)" }}>
          Requesting as {pendingStatus === "ALUMNI" ? "an alumni member" : "an active member"}, as you picked at
          sign-up.
        </p>
      ) : null}

      {loading ? (
        <Spinner label="Loading chapters" />
      ) : (chapters ?? []).length === 0 ? (
        <p style={{ fontSize: "var(--text-sm)", opacity: 0.8 }}>No chapters are open to requests right now.</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {(chapters ?? []).map((chapter) => (
            <div
              key={chapter.id}
              className={authStyles.notice}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}
            >
              <span>
                <strong style={{ display: "block" }}>{chapter.name}</strong>
                {chapter.university ? <span style={{ fontSize: "var(--text-xs)" }}>{chapter.university}</span> : null}
              </span>
              <button
                type="button"
                className={authStyles.submit}
                style={{ width: "auto", padding: "0 var(--space-4)", marginTop: 0 }}
                disabled={busy || requested === chapter.id}
                onClick={() => requestJoin(chapter.id)}
              >
                {requested === chapter.id ? "Requested" : "Request"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
