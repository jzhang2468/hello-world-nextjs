"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { instagramProfileUrl, normalizeInstagramUsername } from "@/lib/instagram-profile";
import { saveInstagramProfile } from "./instagram-profile-actions";
import styles from "./captions.module.css";

type ProfileEditorIntent = { mode: "edit" | "open"; preparePost?: () => void };
type ProfileContext = {
  username: string | null;
  editProfile: (intent: ProfileEditorIntent) => void;
};
const InstagramContext = createContext<ProfileContext | null>(null);

export function useInstagramProfile() {
  const profile = useContext(InstagramContext);
  if (!profile) throw new Error("Missing Instagram profile provider");
  return profile;
}

export function InstagramProfileProvider({ initialUsername, children }: { initialUsername: string | null; children: ReactNode }) {
  const [username, setUsername] = useState(initialUsername);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readyToOpen, setReadyToOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const openLink = useRef<HTMLAnchorElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<ProfileEditorIntent>({ mode: "edit" });

  function editProfile(next: ProfileEditorIntent) {
    intent.current = next;
    setDraft(username ? `@${username}` : "");
    setError("");
    setReadyToOpen(false);
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }

  useEffect(() => {
    if (readyToOpen) openLink.current?.focus();
  }, [readyToOpen]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const normalized = normalizeInstagramUsername(draft);
    if (!normalized) {
      setError("Enter an Instagram username or a link to your profile.");
      input.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await saveInstagramProfile(normalized);
      if (!result.username) {
        setError(result.error || "Couldn’t save your profile. Try again.");
        return;
      }
      setUsername(result.username);
      if (intent.current.mode === "open") setReadyToOpen(true);
      else dialog.current?.close();
    } catch {
      setError("Couldn’t save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InstagramContext.Provider value={{ username, editProfile }}>
      {children}
      <dialog ref={dialog} aria-labelledby="instagram-profile-title" className={`${styles.petPhotoDialog} ${styles.instagramDialog}`}
        onCancel={(event) => { if (saving) event.preventDefault(); }}>
        <h2 id="instagram-profile-title">Your Instagram profile</h2>
        {readyToOpen && username ? <>
          <p role="status">Saved to your FurFrame account.</p>
          <div className={styles.dialogActions}>
            <a ref={openLink} className={styles.darkButton} href={instagramProfileUrl(username)} target="_blank" rel="noopener noreferrer"
              onClick={() => { intent.current.preparePost?.(); dialog.current?.close(); }}>
              Open @{username} on Instagram <span aria-hidden="true">↗</span>
            </a>
            <button type="button" className={styles.textLink} onClick={() => dialog.current?.close()}>Close</button>
          </div>
        </> : <form onSubmit={save}>
          <p>Choose the profile this FurFrame account opens when you share a caption.</p>
          <label htmlFor="instagram-profile-input">Instagram username or profile URL</label>
          <input ref={input} id="instagram-profile-input" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }}
            autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@username" maxLength={512} required
            disabled={saving} aria-invalid={error ? true : undefined} aria-describedby={error ? "instagram-profile-error" : undefined} />
          {error && <p className={styles.formError} id="instagram-profile-error" role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button type="submit" className={styles.darkButton} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
            <button type="button" className={styles.textLink} onClick={() => dialog.current?.close()} disabled={saving}>Cancel</button>
          </div>
        </form>}
      </dialog>
    </InstagramContext.Provider>
  );
}

export function InstagramProfileSettings() {
  const { username, editProfile } = useInstagramProfile();
  return (
    <div className={styles.instagramSettings}>
      <button className={styles.textLink} type="button" onClick={() => editProfile({ mode: "edit" })}
        aria-label={username ? `Edit Instagram profile @${username}` : "Set Instagram profile"}>
        {username ? `Instagram · @${username} · Edit` : "Set Instagram profile"}
      </button>
    </div>
  );
}
