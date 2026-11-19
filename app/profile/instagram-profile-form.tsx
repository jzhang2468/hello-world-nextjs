"use client";

import { useState, type FormEvent } from "react";
import { saveInstagramProfile } from "../captions/instagram-profile-actions";

export default function InstagramProfileForm({ username }: { username: string | null }) {
  const [draft, setDraft] = useState(username ? `@${username}` : "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setSaved(false);
    setError("");
    try {
      const result = await saveInstagramProfile(draft);
      if (result.username) {
        setDraft(`@${result.username}`);
        setSaved(true);
      } else {
        setError(result.error ?? "Couldn’t save your Instagram profile. Try again.");
      }
    } catch {
      setError("Couldn’t save your Instagram profile. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="instagram" className="profile-card instagram-profile-form" aria-label="Instagram profile" onSubmit={save}>
      <div className="form-field">
        <label htmlFor="instagram-username">Instagram username or profile URL</label>
        <input id="instagram-username" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@username"
          value={draft} maxLength={512} required disabled={pending} aria-describedby="instagram-hint" aria-invalid={Boolean(error)}
          onChange={(event) => { setDraft(event.target.value); setError(""); setSaved(false); }} />
        <p id="instagram-hint">Caption Club opens this profile when you choose Open Instagram.</p>
      </div>
      <div className="profile-form-bottom">
        <div className="profile-feedback" aria-live="polite">
          {error && <p className="form-feedback is-error" role="alert">{error}</p>}
          {saved && <p className="form-feedback is-success" role="status">Instagram profile saved.</p>}
        </div>
        <button type="submit" className="black-button" disabled={pending}>{pending ? "Saving…" : "Save Instagram profile"}</button>
      </div>
    </form>
  );
}
