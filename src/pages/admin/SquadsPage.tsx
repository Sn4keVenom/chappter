// src/pages/admin/SquadsPage.tsx
//
// "Should be a way to randomize squads with all of the active members.
// Should be able to specify squad sizes. If a squad does not fill
// completely, that is fine, just make sure they are as even as possible."
//
// Deliberately NOT persisted — this is a one-off grouping tool (splitting
// people up for a single activity), not a lasting roster the way gamification
// Teams are (Points -> Teams, TeamPage.tsx). Building it as its own Team-like
// entity would risk silently colliding with — or someone assuming it should
// replace — whatever Gear Cup teams are already set up, which nothing asked
// for. Regenerate as many times as you like; nothing is saved between visits.

import { useMemo, useState } from "react";

import { getRoster } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Form";
import { ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { UserSummary } from "../../types";

/** Splits `members` into groups of roughly `targetSize`, as even as
 * possible — squadCount is however many groups of at most targetSize it
 * takes to fit everyone, then people are dealt out round-robin so any
 * leftover is spread across squads by at most one person, never dumped
 * into one small leftover group. */
function randomizeSquads(members: UserSummary[], targetSize: number): UserSummary[][] {
  const shuffled = [...members];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const squadCount = Math.max(1, Math.ceil(shuffled.length / targetSize));
  const squads: UserSummary[][] = Array.from({ length: squadCount }, () => []);
  shuffled.forEach((member, i) => squads[i % squadCount].push(member));
  return squads;
}

export default function SquadsPage() {
  const { data, loading, error, reload } = useAsync(
    () => getRoster({ status: "ACTIVE", limit: 200 }).then((r) => r.users),
    []
  );

  const [targetSize, setTargetSize] = useState("5");
  const [squads, setSquads] = useState<UserSummary[][] | null>(null);
  const [copied, setCopied] = useState(false);

  const members = data ?? [];
  const size = Math.max(1, Number(targetSize) || 1);

  function generate() {
    setCopied(false);
    setSquads(randomizeSquads(members, size));
  }

  const summaryText = useMemo(() => {
    if (!squads) return "";
    return squads
      .map((squad, i) => `Squad ${i + 1} (${squad.length})\n${squad.map((m) => `  ${m.firstName} ${m.lastName}`).join("\n")}`)
      .join("\n\n");
  }, [squads]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
    } catch {
      // Clipboard access denied — the squads are still on screen either way.
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load the roster" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Squad Randomizer" subtitle="Split active members into even, random groups for one activity." />

      <Card style={{ marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <Input
              label="Target squad size"
              type="number"
              inputMode="numeric"
              min={1}
              value={targetSize}
              onChange={(e) => setTargetSize(e.target.value)}
              hint={`${members.length} active member${members.length === 1 ? "" : "s"} to split up`}
            />
          </div>
          <Button variant="primary" onClick={generate} disabled={members.length === 0}>
            {squads ? "Regenerate" : "Randomize"}
          </Button>
        </div>
      </Card>

      {squads ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
            <Button variant="secondary" size="sm" onClick={copySummary}>
              {copied ? "Copied!" : "Copy as text"}
            </Button>
          </div>
          <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {squads.map((squad, i) => (
              <Card key={i}>
                <CardLabel>
                  Squad {i + 1} ({squad.length})
                </CardLabel>
                <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-1)" }}>
                  {squad.map((member) => (
                    <p key={member.id} style={{ fontSize: "var(--text-sm)" }}>
                      {member.firstName} {member.lastName}
                    </p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
