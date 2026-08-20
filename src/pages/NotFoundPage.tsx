// src/pages/NotFoundPage.tsx
//
// Catch-all for unmatched URLs. Real browser routing means people can and will
// type or bookmark paths that don't exist, which the mobile app never had to
// handle.

import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/ui/Feedback";
import { ButtonLink } from "../components/ui/Button";

export default function NotFoundPage() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Page not found" />
      <EmptyState
        icon="🧭"
        title="That page doesn't exist"
        body="The link may be out of date, or the page may have moved."
        action={
          <ButtonLink to="/" variant="primary">
            Go to Home
          </ButtonLink>
        }
      />
    </div>
  );
}
