// src/pages/auth/SignUpPage.tsx — account creation, with roster-verified
// role-number matching for Active/Alumni signups.
//
// Flow: validate → (Active/Alumni only) verify-role-number pre-check against
// the exec-maintained roster → Clerk signUp.create() → stash phone/status/
// roleNumber (Clerk's signUp resource has no room for them — see
// auth/pendingSignup.ts) → prepareEmailAddressVerification → /verify-email,
// which does the atomic claim once a session actually exists (see
// VerifyEmailPage.tsx and its "why the claim isn't here" note).
//
// The role-number field itself is filled in automatically where possible:
// once both names and an Active/Alumni status are in, a debounced call to
// lookup-role-number tries to resolve them to an unclaimed roster row (see
// that route's doc comment for the exact matching rule). It only ever
// overwrites a value THIS lookup put there — the moment the person edits
// the field by hand, autofill backs off for good, even if they later change
// their name/status again.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignUp } from "@clerk/clerk-react";

import { lookupRoleNumber, verifyRoleNumber } from "../../api/auth";
import { stashPendingSignup } from "../../auth/pendingSignup";
import { ChoiceList, type Choice } from "../../components/ui/Form";
import { clerkErrorMessage } from "../../auth/clerkError";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit } from "./AuthForm";

const MIN_PASSWORD_LENGTH = 10;
const ROLE_NUMBER_LOOKUP_DEBOUNCE_MS = 500;

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

  // "auto" means the current roleNumber value came from lookup-role-number,
  // not the person's own typing — see roleNumberSource's ref below for why
  // this needs to be readable synchronously from inside a debounced effect.
  const [roleNumberSource, setRoleNumberSource] = useState<"auto" | "manual" | null>(null);
  const roleNumberSourceRef = useRef(roleNumberSource);
  roleNumberSourceRef.current = roleNumberSource;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    if (key === "roleNumber") setRoleNumberSource("manual");
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-fill the role number once we have enough to look it up. Debounced
  // so it doesn't fire on every keystroke, and it never overwrites a value
  // the person typed themselves (roleNumberSourceRef guards that at the
  // point the response comes back, not just when the request goes out —
  // someone could start typing mid-flight).
  useEffect(() => {
    if (form.status === "PNM") return;
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) return;
    if (roleNumberSourceRef.current === "manual") return;

    const status = form.status as "ACTIVE" | "ALUMNI";
    const timer = setTimeout(() => {
      lookupRoleNumber({ firstName, lastName, status })
        .then((result) => {
          if (roleNumberSourceRef.current === "manual") return; // edited while in flight
          if (result.found) {
            setForm((f) => ({ ...f, roleNumber: String(result.roleNumber) }));
            setRoleNumberSource("auto");
          }
        })
        .catch(() => {
          // Silent — this is a convenience, not a validation step. The
          // person can still type their own number; verifyRoleNumber at
          // submit time is the real check.
        });
    }, ROLE_NUMBER_LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [form.firstName, form.lastName, form.status]);

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
      setBanner(clerkErrorMessage(e, "Couldn't create your account. Please try again."));
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
          hint="Use a personal email, not your school address — you'll lose access to a school account after you graduate."
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
            hint={
              errors.roleNumber
                ? undefined
                : roleNumberSource === "auto"
                  ? "Matched to your roster entry — change it if that's wrong."
                  : "We'll check this against your chapter's roster. Enter your first and last name above and we'll try to fill this in for you."
            }
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
