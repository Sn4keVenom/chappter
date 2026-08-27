// src/pages/auth/SignUpPage.tsx — account creation, with roster-verified
// role-number matching for Active/Alumni signups.
//
// Flow: validate → (Active/Alumni only) verify-role-number pre-check against
// the exec-maintained roster → Clerk signUp.create() → stash phone/status/
// roleNumber (Clerk's signUp resource has no room for them — see
// auth/pendingSignup.ts) → prepareEmailAddressVerification → /verify-email,
// which does the atomic claim once a session actually exists (see
// VerifyEmailPage.tsx and its "why the claim isn't here" note).

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignUp } from "@clerk/clerk-react";

import { verifyRoleNumber } from "../../api/auth";
import { stashPendingSignup } from "../../auth/pendingSignup";
import { ChoiceList, type Choice } from "../../components/ui/Form";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit } from "./AuthForm";

const MIN_PASSWORD_LENGTH = 10;

const STATUS_OPTIONS: Choice<"PNM" | "ACTIVE" | "ALUMNI">[] = [
  { value: "PNM", label: "PNM", hint: "Prospective member — no role number yet" },
  { value: "ACTIVE", label: "Active member", hint: "Currently initiated and active" },
  { value: "ALUMNI", label: "Alumni", hint: "Graduated / no longer active" },
];

export default function SignUpPage() {
  const { isLoaded, signUp } = useSignUp();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
    phone: "",
    status: "PNM" as "PNM" | "ACTIVE" | "ALUMNI",
    roleNumber: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "First name is required.";
    if (!form.username.trim()) next.username = "Choose a username.";
    if (!form.email.trim()) next.email = "Email is required.";
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (form.password !== form.confirm) next.confirm = "Passwords don't match.";
    if (!form.phone.trim()) next.phone = "Phone number is required.";
    if (form.status !== "PNM") {
      const n = Number(form.roleNumber);
      if (!form.roleNumber.trim() || !Number.isInteger(n) || n <= 0) {
        next.roleNumber = "Enter your role number.";
      }
    }
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    if (!isLoaded) return;

    setBusy(true);
    setBanner(null);
    try {
      const roleNumber = form.status === "PNM" ? null : Number(form.roleNumber);

      if (roleNumber != null) {
        const check = await verifyRoleNumber({
          firstName: form.firstName.trim(),
          roleNumber,
          status: form.status as "ACTIVE" | "ALUMNI",
        });
        if (!check.valid) {
          setErrors((e) => ({ ...e, roleNumber: "Name and role number don't match our records." }));
          setBusy(false);
          return;
        }
      }

      await signUp.create({
        emailAddress: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim(),
      });

      stashPendingSignup({ phone: form.phone.trim(), status: form.status, roleNumber });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      navigate("/verify-email");
    } catch (e: any) {
      setBanner(e?.errors?.[0]?.message ?? "Couldn't create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-lg)" }}>Create an account</h2>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          label="First name"
          value={form.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          error={errors.firstName}
          autoComplete="given-name"
        />
        <AuthField
          label="Last name"
          value={form.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          autoComplete="family-name"
        />
        <AuthField
          label="Username"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          error={errors.username}
          autoComplete="username"
          autoCapitalize="none"
        />
        <AuthField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          error={errors.email}
          autoComplete="email"
          autoCapitalize="none"
        />
        <AuthField
          label="Password"
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          error={errors.password}
          hint={!errors.password ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          autoComplete="new-password"
        />
        <AuthField
          label="Confirm password"
          type="password"
          value={form.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          error={errors.confirm}
          autoComplete="new-password"
        />
        <AuthField
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={errors.phone}
          autoComplete="tel"
        />

        <div style={{ marginBottom: "var(--space-4)" }}>
          <ChoiceList
            legend="Status"
            options={STATUS_OPTIONS}
            value={form.status}
            onChange={(status) => set("status", status)}
          />
        </div>

        {form.status !== "PNM" ? (
          <AuthField
            label="Role number"
            type="number"
            inputMode="numeric"
            value={form.roleNumber}
            onChange={(e) => set("roleNumber", e.target.value)}
            error={errors.roleNumber}
            hint={!errors.roleNumber ? "We'll check this against your chapter's roster." : undefined}
          />
        ) : null}

        <AuthSubmit disabled={busy}>{busy ? "Creating account…" : "Create account"}</AuthSubmit>
      </form>

      <AuthLinks>
        <span>
          Already have an account? <Link to="/login">Sign in</Link>
        </span>
      </AuthLinks>
    </div>
  );
}
