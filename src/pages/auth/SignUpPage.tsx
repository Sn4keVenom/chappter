// src/pages/auth/SignUpPage.tsx — account creation.
// See AuthForm.tsx for why submission explains rather than registering.

import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthBanner, AuthField, AuthLinks, AuthNotAvailableNotice, AuthSubmit } from "./AuthForm";

export default function SignUpPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "First name is required.";
    if (!form.username.trim()) next.username = "Choose a username.";
    if (!form.email.trim()) next.email = "Email is required.";
    if (form.password.length < 8) next.password = "Use at least 8 characters.";
    if (form.password !== form.confirm) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBanner(
      "Account creation isn't connected in this build — see the note below. Demo Mode signs you in automatically."
    );
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
          label="Phone (optional)"
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          autoComplete="tel"
        />

        <AuthSubmit>Create account</AuthSubmit>
      </form>

      <AuthLinks>
        <span>
          Already have an account? <Link to="/login">Sign in</Link>
        </span>
      </AuthLinks>

      <div style={{ marginTop: "var(--space-6)" }}>
        <AuthNotAvailableNotice />
      </div>
    </div>
  );
}
