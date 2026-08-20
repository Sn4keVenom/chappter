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
// The mobile app scanned the QR with expo-camera. On the web, camera access
// requires HTTPS, an explicit permission prompt, and a barcode-detection API
// that Safari still doesn't ship — so a scanner would be unreliable exactly
// where it's needed (a phone at an event). Typing the six-or-so characters
// printed under the QR is quick, works everywhere, and needs no permission.
// The QR is still rendered, so a native camera app can read it and open the
// link directly.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

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

function OrganizerView({ eventId }: { eventId: string }) {
  const [token, setToken] = useState<string | null>(null);
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

      {token ? (
        <>
          <div className={styles.qrPanel}>
            <QRCode value={token} size={220} alt="Check-in QR code" />
            <p className={styles.codeText}>{token}</p>
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ points: number; late: boolean; already: boolean } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await selfCheckIn(eventId, code.trim());
      setResult({
        points: response.attendance.pointsAwarded,
        late: response.attendance.late,
        already: Boolean(response.alreadyCheckedIn),
      });
    } catch (e: any) {
      setError(e?.message ?? "That code didn't work. Ask the organizer for the current one.");
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className={styles.wrap}>
      <Card className={styles.form}>
        <form onSubmit={submit}>
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
