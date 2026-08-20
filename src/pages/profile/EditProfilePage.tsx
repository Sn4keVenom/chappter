// src/pages/profile/EditProfilePage.tsx
//
// Self-service profile editor. Deliberately never exposes role, office,
// status, or role number — those are administrative fields, changed from a
// member's profile by someone with the permission to do it. The API endpoint
// (PATCH /users/me) ignores them too, so this is defence in depth rather than
// the only guard.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getMe, updateMyProfile } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { useAuthStore } from "../../store/useAuthStore";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";

export default function EditProfilePage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);

  const { data: me, loading } = useAsync(() => getMe(), []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [major, setMajor] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName);
    setLastName(me.lastName);
    setPhone(me.phone ?? "");
    setAvatarUrl(me.avatarUrl ?? "");
    setMajor(me.major ?? "");
    setGraduationYear(me.graduationYear ? String(me.graduationYear) : "");
  }, [me]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "First name is required.";
    const year = graduationYear.trim() ? Number(graduationYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
      errors.graduationYear = "Enter a four-digit year.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        major: major.trim() || null,
        graduationYear: year,
      });

      // Keep the shell's user card and greeting in step immediately, rather
      // than waiting for the next full fetch.
      if (currentUser) {
        setUser({
          ...currentUser,
          firstName: updated.firstName,
          lastName: updated.lastName,
          major: updated.major,
          graduationYear: updated.graduationYear,
        });
      }
      navigate("/profile", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save your profile — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Edit profile" backTo="/profile" backLabel="Profile" />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="First name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={fieldErrors.firstName}
            autoComplete="given-name"
          />
          <Input
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            hint="Optional. Shared with chapter officers only."
          />
          <Input
            label="Major"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="Mechanical Engineering"
          />
          <Input
            label="Graduation year"
            type="number"
            inputMode="numeric"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            error={fieldErrors.graduationYear}
            placeholder="2027"
          />
          <Input
            label="Avatar image URL"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            hint="Optional. Uploading a file isn't supported yet — paste a hosted image URL."
            autoCapitalize="none"
          />

          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
            <Button type="submit" variant="primary" block busy={saving}>
              Save changes
            </Button>
            <Button variant="secondary" block onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
