// src/pages/FeedbackPage.tsx
//
// In-app feedback and bug reports. Open to every member — the permission gate
// is on reading everyone else's submissions, not on making one.

import { useState } from "react";

import { submitFeedback } from "../api/feedback";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ChoiceList, Textarea } from "../components/ui/Form";
import { EmptyState, ErrorBanner } from "../components/ui/Feedback";
import type { FeedbackType } from "../types";

const APP_VERSION = "2.0.0";

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("BUG");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await submitFeedback({
        type,
        message: message.trim(),
        appVersion: APP_VERSION,
        // Captured so a report can be reproduced — which browser, which OS.
        platform: navigator.userAgent,
      });
      setSent(true);
      setMessage("");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send your feedback — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div className="page page-narrow">
        <PageHeader title="Send feedback" backTo="/settings" backLabel="Settings" />
        <Card>
          <EmptyState
            icon="✅"
            title="Thanks — that's been sent"
            body="Your chapter's officers can see it from the admin area."
            action={
              <Button variant="secondary" onClick={() => setSent(false)}>
                Send another
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Send feedback"
        subtitle="Report a bug, request a feature, or tell us what's working."
        backTo="/settings"
        backLabel="Settings"
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <form onSubmit={handleSubmit}>
          <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
            <legend
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              What kind of feedback is this?
            </legend>
            <ChoiceList
              legend="Feedback type"
              value={type}
              onChange={(next) => setType(next as FeedbackType)}
              options={[
                { value: "BUG", label: "🐛 Bug", hint: "Something is broken or behaving oddly" },
                { value: "FEATURE_REQUEST", label: "💡 Feature request", hint: "Something you'd like added" },
                { value: "GENERAL", label: "💬 General", hint: "Anything else" },
              ]}
            />
          </fieldset>

          <Textarea
            label="Details"
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            hint="What you were doing, what you expected, and what happened instead."
            placeholder="On the Events page, tapping Required only cleared my category filter…"
            rows={6}
          />

          <Button type="submit" variant="primary" block busy={saving} disabled={!message.trim()}>
            Send feedback
          </Button>
        </form>
      </Card>
    </div>
  );
}
