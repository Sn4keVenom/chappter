// src/pages/events/CheckInPage.tsx
//
// Two modes on one route, chosen by permission rather than a route param
// (which is what the mobile app used — but on the web a URL that says
// "?mode=officer" invites tampering, and the answer is already knowable):
//
//   organizer/delegate — displays the rotating check-in code as a QR plus the
//                        literal characters, and a live count of arrivals
//   member             — enters the code shown on the organizer's screen
//
// ── What changed from mobile, and why ────────────────────────────────────
// The mobile app scanned the QR with expo-camera. On the web there's no
// in-app scanner (camera access needs HTTPS, an explicit permission prompt,
// and a barcode-detection API Safari still doesn't ship) — but a phone's
// own camera app already scans any QR system-wide with no permission dance,
// so the QR encodes a real link into THIS page with the token attached
// (checkInLink() below), not the bare token. Opened, it auto-submits the
// same request MemberView's form would — no typing needed, matching how the
// mobile app's scan worked. Typing the code by hand (under the QR, and in
// the form below) is the fallback for when scanning isn't convenient — e.g.
// the code is projected on a screen across the room.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { getCheckInToken, getEventRoster, selfCheckIn } from "../../api/attendance";
import { getEvent } from "../../api/events";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Form";
import { QRCode } from "../../components/ui/QRCode";
import { ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import styles from "./CheckInPage.module.css";

/** The server's token is valid 60s; refresh at 55 to avoid a race at the edge. */
const REFRESH_MS = 55_000;

function checkInLink(eventId: string, token: string): string {
  return `${window.location.origin}/events/${eventId}/check-in?token=${encodeURIComponent(token)}`;
}

function OrganizerView({ eventId }: { eventId: string }) {
  // token drives the QR (a camera reads it, nobody types it — length is
  // irrelevant there); code is the short, human-typeable alternative shown
  // as text underneath, for "read it off the screen and type it in" when
  // scanning isn't convenient. Both come from the same rotation.
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [checkedIn, setCheckedIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchToken = useCallback(async () => {
    try {
      const result = await getCheckInToken(eventId);
      if (!mounted.current) return;
      setToken(result.token);
      setCode(result.code);
      setExpiresAt(result.expiresAt);
      setError(null);
    } catch (e: any) {
      // Keep the previous code on screen — it may still be valid, and blanking
      // the display mid-event is worse than a stale-but-working code.
      if (mounted.current) setError(e?.message ?? "Couldn't refresh the check-in code.");
    }
  }, [eventId]);

  const fetchCount = useCallback(async () => {
    try {
      const roster = await getEventRoster(eventId);
      if (mounted.current) setCheckedIn(roster.checkedInCount);
    } catch {
      /* The count is informational; a failure shouldn't disturb the code. */
    }
  }, [eventId]);

  useEffect(() => {
    fetchToken();
    fetchCount();
    const tokenTimer = setInterval(fetchToken, REFRESH_MS);
    const countTimer = setInterval(fetchCount, 10_000);
    return () => {
      clearInterval(tokenTimer);
      clearInterval(countTimer);
    };
  }, [fetchToken, fetchCount]);

  // Separate 1s tick for the countdown so the display stays live without
  // re-requesting anything.
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className={styles.wrap}>
      {error ? <ErrorBanner message={error} onRetry={fetchToken} /> : null}

      {token && code ? (
        <>
          <div className={styles.qrPanel}>
            <QRCode value={checkInLink(eventId, token)} size={220} alt="Check-in QR code" />
            <p className={styles.codeText}>{code}</p>
          </div>
          <p className={styles.countdown} role="status">
            {/* aria-live via role=status: a screen-reader user hears the code
                rotate rather than silently going stale. */}
            Code refreshes in {secondsLeft}s
          </p>
        </>
      ) : (
        <LoadingState label="Generating check-in code…" />
      )}

      <Card style={{ width: "min(320px, 100%)" }}>
        <CardLabel>Checked in</CardLabel>
        <p className={styles.counter}>{checkedIn ?? "—"}</p>
        <p className={styles.counterLabel}>Updates every 10 seconds</p>
      </Card>
    </div>
  );
}

function MemberView({ eventId }: { eventId: string }) {
  const [params, setParams] = useSearchParams();
  // Captured once, from whatever the URL held on the very first render —
  // deliberately NOT re-derived from `params` on every render, since the
  // auto-submit effect below deletes the token from the URL almost
  // immediately, and this needs to keep remembering "this visit started
  // from a scan" after that happens.
  const [autoSubmitting, setAutoSubmitting] = useState(() => params.get("token") != null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ points: number; late: boolean; already: boolean } | null>(null);
  // A ref, not state, because this must run exactly once even though
  // `submit` (called from the effect below) changes on every render.
  const autoSubmitted = useRef(false);

  const submit = useCallback(
    async (credential: { token: string } | { code: string }) => {
      setBusy(true);
      setError(null);
      try {
        const response = await selfCheckIn(eventId, credential);
        setResult({
          points: response.attendance.pointsAwarded,
          late: response.attendance.late,
          already: Boolean(response.alreadyCheckedIn),
        });
      } catch (e: any) {
        setError(e?.message ?? "That code didn't work. Ask the organizer for the current one.");
        // Let a failed auto-submit (an expired or already-used scan) fall
        // through to the manual form instead of being stuck on a loading
        // state forever.
        setAutoSubmitting(false);
      } finally {
        setBusy(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    const fromLink = params.get("token");
    if (!fromLink || autoSubmitted.current) return;
    autoSubmitted.current = true;
    // Clear it from the URL immediately — a scanned link left in the
    // address bar would otherwise re-submit (now-expired) on every refresh,
    // and would resubmit the stale token if the manual retry below succeeds.
    setParams((p) => {
      p.delete("token");
      return p;
    }, { replace: true });
    // Deliberately not pre-filling the code field with the (long) token —
    // if this fails, the fallback is typing the short code shown on the
    // organizer's screen, not this URL's token.
    void submit({ token: fromLink });
  }, [params, setParams, submit]);

  if (result) {
    return (
      <div className={styles.wrap}>
        <div className={styles.result} role="status">
          <span className={styles.resultIcon} aria-hidden="true">
            {result.late ? "⏱️" : "✅"}
          </span>
          <p className={styles.resultTitle}>
            {result.already ? "Already checked in" : result.late ? "Checked in — late" : "Checked in"}
          </p>
          <p className={styles.resultBody}>
            {result.already
              ? "You were already on the attendance list for this event."
              : `+${result.points} points awarded.`}
          </p>
        </div>
      </div>
    );
  }

  // Scanned the QR: skip straight to "checking you in" rather than flashing
  // the manual-entry form for a frame before the effect above fires.
  if (autoSubmitting && !error) {
    return (
      <div className={styles.wrap}>
        <LoadingState label="Checking you in…" />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Card className={styles.form}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim() && !busy) void submit({ code: code.trim() });
          }}
        >
          <Input
            label="Check-in code"
            hint="Enter the code shown on the organizer's screen. It changes every minute."
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={error ?? undefined}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="one-time-code"
            autoFocus
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
          />
          <Button type="submit" variant="primary" block busy={busy} disabled={!code.trim()}>
            Check in
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function CheckInPage() {
  const { eventId = "" } = useParams();
  const { canGenerateCheckIn } = usePermissions();
  const { data: event, loading, error, reload } = useAsync(() => getEvent(eventId), [eventId]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load this event" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  const isOrganizer = canGenerateCheckIn(event);

  return (
    <div className="page page-narrow">
      <PageHeader
        title={isOrganizer ? "Check-in code" : "Check in"}
        subtitle={event.title}
        backTo={`/events/${eventId}`}
        backLabel="Event"
      />
      {isOrganizer ? <OrganizerView eventId={eventId} /> : <MemberView eventId={eventId} />}
    </div>
  );
}
