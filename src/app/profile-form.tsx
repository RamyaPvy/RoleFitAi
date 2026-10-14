"use client";

import { useActionState } from "react";
import { type AuthFormState, saveProfileAction } from "@/app/actions";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(saveProfileAction, {});
  return (
    <form action={action} className="profile-editor">
      <div className="profile-form">
        <div className="form-field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            name="fullName"
            autoComplete="name"
            defaultValue={profile?.full_name ?? ""}
            required
            maxLength={120}
          />
        </div>
        <div className="form-field">
          <label htmlFor="currentRole">Current or target roles</label>
          <input
            id="currentRole"
            name="currentRole"
            defaultValue={profile?.current_role ?? ""}
            maxLength={160}
            placeholder="DevOps Engineer, Cloud Engineer"
          />
          <p className="form-hint">
            Separate up to 5 roles with commas. Job matches searches these by default.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="phone">Mobile</label>
          <input
            id="phone"
            name="phone"
            autoComplete="tel"
            defaultValue={profile?.phone ?? ""}
            maxLength={60}
          />
        </div>
        <div className="form-field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            autoComplete="address-level2"
            defaultValue={profile?.location ?? ""}
            maxLength={120}
            placeholder="City, State"
          />
        </div>
        <div className="form-field">
          <label htmlFor="linkedinUrl">LinkedIn URL</label>
          <input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            defaultValue={profile?.linkedin_url ?? ""}
            maxLength={250}
            placeholder="https://linkedin.com/in/…"
          />
        </div>
        <div className="form-field">
          <label htmlFor="githubUrl">GitHub URL</label>
          <input
            id="githubUrl"
            name="githubUrl"
            type="url"
            defaultValue={profile?.github_url ?? ""}
            maxLength={250}
            placeholder="https://github.com/…"
          />
        </div>
        <div className="form-field">
          <label htmlFor="experienceYears">Years of experience</label>
          <input
            id="experienceYears"
            name="experienceYears"
            type="number"
            min={0}
            max={80}
            step={1}
            defaultValue={profile?.experience_years ?? ""}
          />
        </div>
        <div className="form-field">
          <label htmlFor="skills">Tools and technologies</label>
          <input
            id="skills"
            name="skills"
            defaultValue={profile?.skills.join(", ") ?? ""}
            maxLength={4000}
            placeholder="React, TypeScript, Node.js"
          />
          <p className="form-hint">
            Comma-separated. Never add skills you cannot support with real experience.
          </p>
        </div>
        <div className="form-field form-field-full">
          <label htmlFor="summary">Professional summary</label>
          <textarea
            id="summary"
            name="summary"
            defaultValue={profile?.summary ?? ""}
            maxLength={4000}
          />
        </div>
        <div className="form-field form-field-full">
          <label htmlFor="experience">Experience details</label>
          <textarea
            id="experience"
            name="experience"
            defaultValue={profile?.experience ?? ""}
            maxLength={20000}
          />
          <p className="form-hint">
            Add real roles, employers, dates, responsibilities, and outcomes. Your profile is
            private to your account.
          </p>
        </div>
      </div>
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
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save private profile"}
        </button>
      </div>
    </form>
  );
}
