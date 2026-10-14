"use client";

import { useActionState, useState } from "react";
import { type AuthFormState, signInAction, signUpAction } from "@/app/actions";

const initialState: AuthFormState = {};

export function AuthForm({
  configured,
  errorMessage,
}: {
  configured: boolean;
  errorMessage?: string;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [signInState, signIn, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUp, signUpPending] = useActionState(signUpAction, initialState);
  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <section className="auth-card">
      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "auth-tab is-selected" : "auth-tab"}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "auth-tab is-selected" : "auth-tab"}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
      </div>

      {errorMessage && (
        <p className="form-message is-error" role="alert">
          {errorMessage}
        </p>
      )}
      {!configured && (
        <div className="setup-notice" role="status">
          <strong>Account service not connected yet</strong>
          <p>
            Add your Supabase project URL and publishable key to <code>.env.local</code>, then apply
            the database migration. No account details are sent anywhere until you connect your own
            project.
          </p>
        </div>
      )}
      {state.error && (
        <p className="form-message is-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="form-message is-success" role="status">
          {state.message}
        </p>
      )}

      <form action={mode === "signin" ? signIn : signUp} className="credentials-form">
        <div className="form-field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            disabled={!configured || pending}
          />
        </div>
        <div className="form-field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={12}
            maxLength={72}
            placeholder="At least 12 characters"
            disabled={!configured || pending}
          />
        </div>
        <button
          className="button button-primary auth-submit"
          type="submit"
          disabled={!configured || pending}
        >
          {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create secure account"}
          {!pending && <span aria-hidden="true">→</span>}
        </button>
      </form>
      <p className="auth-footnote">
        Your profile will be private to your account. Don&apos;t reuse another site&apos;s password.
      </p>
    </section>
  );
}
