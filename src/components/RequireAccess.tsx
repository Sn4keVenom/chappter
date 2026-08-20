// src/components/RequireAccess.tsx
//
// Shown in place of a page's content when the signed-in user lacks the
// permission it requires. Kept as an in-page state rather than a redirect so
// the URL stays put — a bookmarked admin link should explain why it's not
// available, not silently bounce somewhere else.

import { EmptyState } from "./ui/Feedback";
import { ButtonLink } from "./ui/Button";

export default function RequireAccess({
  message = "You don't have permission to view this page.",
}: {
  message?: string;
}) {
  return (
    <EmptyState
      icon="🔒"
      title="Access restricted"
      body={message}
      action={
        <ButtonLink to="/" variant="secondary">
          Go to Home
        </ButtonLink>
      }
    />
  );
}
