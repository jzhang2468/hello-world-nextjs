"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveProfile } from "./actions";
import type { Profile, ProfileFormState } from "@/lib/profile-types";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfileForm({ profile, avatarUrl, email, complete }: { profile: Profile | null; avatarUrl: string | null; email: string; complete: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [state, formAction, pending] = useActionState(
    async (previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> => {
      if (photoError) return { error: photoError };
      if (photo) formData.set("avatar", photo);
      const result = await saveProfile(previous, formData);
      if (result.success) {
        setPhoto(null);
        setPhotoPreview(null);
        if (fileInput.current) fileInput.current.value = "";
      }
      return result;
    },
    {},
  );

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}` || "✳";
  const image = photoPreview || avatarUrl;
  const ready = complete || Boolean(state.success && firstName.trim() && lastName.trim());

  return (
    <div className="profile-layout">
      <form className="profile-card" action={formAction} aria-label="Edit your profile">
        <div className="profile-card-heading"><span className="eyebrow">01 / MY PROFILE</span><span className="private-badge">Just for you</span></div>
        {!complete && !state.success && <p className="onboarding-note">One last hello: add your first and last name to continue to Caption Club. Your photo is optional.</p>}
        <div className="profile-photo-section">
          <div className="profile-avatar">
            {image ? <Image src={image} alt="Your profile photo" fill unoptimized sizes="108px" /> : <span aria-hidden="true">{initials}</span>}
          </div>
          <div className="profile-photo-controls">
            <label className="upload-photo-button" htmlFor="avatar">{image ? "Change photo" : "Upload a photo"}<span aria-hidden="true">↗</span></label>
            <input ref={fileInput} className="photo-file-input" id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} aria-describedby="avatar-help avatar-error" onChange={(event) => {
              const file = event.target.files?.[0];
              setPhotoError("");
              if (!file) return;
              if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
                setPhotoError("Choose a JPEG, PNG, or WebP photo that is 3 MB or smaller.");
                setPhoto(null);
                setPhotoPreview(null);
                event.target.value = "";
                return;
              }
              setPhoto(file);
              setPhotoPreview(URL.createObjectURL(file));
            }} />
            <p id="avatar-help">JPEG, PNG or WebP · Up to 3 MB</p>
            {photo && <p className="photo-ready">New photo ready to save.</p>}
            <p id="avatar-error" className="field-error" role={photoError ? "alert" : undefined}>{photoError}</p>
            {(photo || photoError) && <button className="cancel-photo-button" type="button" disabled={pending} onClick={() => {
              setPhoto(null);
              setPhotoPreview(null);
              setPhotoError("");
              if (fileInput.current) fileInput.current.value = "";
            }}>Cancel photo change</button>}
          </div>
        </div>
        <div className="profile-fields">
          <div className="form-field"><label htmlFor="first_name">First name <span aria-hidden="true">*</span></label><input id="first_name" name="first_name" autoComplete="given-name" placeholder="Your first name" required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={pending} /></div>
          <div className="form-field"><label htmlFor="last_name">Last name <span aria-hidden="true">*</span></label><input id="last_name" name="last_name" autoComplete="family-name" placeholder="Your last name" required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={pending} /></div>
        </div>
        <div className="profile-email"><span>Connected with Google</span><p>{email}</p><small>Your sign-in email stays with your Google account.</small></div>
        <div className="profile-form-bottom">
          <div className="profile-feedback" aria-live="polite">{state.error && <p className="form-feedback is-error" role="alert">{state.error}</p>}{state.success && <p className="form-feedback is-success" role="status">{state.success}</p>}</div>
          <button className="black-button" disabled={pending || Boolean(photoError)} type="submit">{pending ? "Saving your profile…" : complete ? "Save profile" : "Save & continue"}<span aria-hidden="true">{pending ? "·" : "↗"}</span></button>
        </div>
      </form>
      <aside className="profile-club-card" aria-labelledby="profile-club-title">
        <div className="club-card-star" aria-hidden="true">✳</div>
        <span className="eyebrow">THE FURFRAME CAPTION CLUB</span>
        <h2 id="profile-club-title">Your pet.<br />The main character.</h2>
        <p>Bring a favourite photo, find its perfect caption, and vote for the ones that make you smile.</p>
        {ready ? <Link className="black-button" href="/captions">Go to Caption Club <span aria-hidden="true">→</span></Link> : <p className="profile-club-locked">Save your name to start making captions <span aria-hidden="true">↗</span></p>}
        <span className="profile-club-caption">FOR EVERY KIND OF GOOD DOG.</span>
      </aside>
    </div>
  );
}
