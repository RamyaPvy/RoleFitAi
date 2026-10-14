"use client";

import { useActionState } from "react";
import { type AuthFormState, uploadResumeAction } from "@/app/actions";

export function ResumeUploadForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(uploadResumeAction, {});
  return (
    <form action={action} className="profile-editor">
      <div className="form-field">
        <label htmlFor="resume">Upload a resume</label>
        <input
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
        />
        <p className="form-hint">
          PDF or DOCX, up to 5 MB. Stored privately; only you can open it.
        </p>
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
          {pending ? "Uploading…" : "Upload resume"}
        </button>
      </div>
    </form>
  );
}
