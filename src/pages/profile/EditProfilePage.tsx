// src/pages/profile/EditProfilePage.tsx
//
// Self-service profile editor. Deliberately never exposes role, office,
// status, or role number — those are administrative fields, changed from a
// member's profile by someone with the permission to do it. The API endpoint
// (PATCH /users/me) ignores them too, so this is defence in depth rather than
// the only guard.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getMe, updateMyProfile } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { useAuthStore } from "../../store/useAuthStore";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import styles from "./EditProfilePage.module.css";

// There's no object storage behind this app yet (same placeholder gap as
// documents.routes.ts) — a hosted-file upload would need a server endpoint,
// storage, and a CDN path that don't exist. What CAN be done today without
// any of that: resize the picked image down to a small square client-side
// and store it as a data: URI in the existing avatarUrl column (already a
// plain string — Zod's .url() and the Postgres column both already accept
// one; see backend/routes/users.routes.ts selfProfileSchema). That's the
// actual fix for "should be an upload, not a URL" — the member never sees or
// types a URL again. If real hosted storage is added later, only this
// function's return value needs to change; the rest of the form is unaware.
//
// AVATAR_SIZE is deliberately small — this becomes a base64 string sitting
// in a plain Postgres TEXT column, not a dedicated blob store, so the goal
// is "good enough for a 36-72px circular avatar," not photo quality.
const AVATAR_SIZE = 256;
const AVATAR_JPEG_QUALITY = 0.85;
const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024; // reject only genuinely absurd picks (RAW, TIFF, etc.)

/** Center-crops to a square, downsamples to AVATAR_SIZE, and re-encodes as
 * JPEG — so a 12-megapixel phone photo doesn't turn into a multi-MB row. */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't supported in this browser.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    return canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

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

  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleAvatarFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets picking the exact same file again re-fire onChange
    if (!file) return;

    setAvatarError(null);

    if (!file.type.startsWith("image/")) {
      setAvatarError("Choose an image file (JPEG, PNG, etc.).");
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setAvatarError("That image is too large — choose one under 15MB.");
      return;
    }

    setAvatarProcessing(true);
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch {
      setAvatarError("Couldn't read that image — try a different file.");
    } finally {
      setAvatarProcessing(false);
    }
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
          <div className={styles.avatarRow}>
            <span className={styles.avatarPreview} aria-hidden="true">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className={styles.avatarImg} />
              ) : (
                `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?"
              )}
            </span>
            <div className={styles.avatarActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFile}
                className={styles.avatarFileInput}
                id="avatar-file-input"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                busy={avatarProcessing}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
              {avatarUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl("")}>
                  Remove
                </Button>
              ) : null}
              {avatarError ? <span className={styles.avatarError}>{avatarError}</span> : null}
            </div>
          </div>

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
