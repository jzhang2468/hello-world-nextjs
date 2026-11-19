import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useInstagramProfileUrl } from "./instagram-profile";
import styles from "./captions.module.css";

async function jpegFromUpload(source: File): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error("Unsupported image size");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob?.size && blob.type === "image/jpeg") resolve(blob);
        else reject(new Error("JPEG unavailable"));
      }, "image/jpeg", 0.94);
    });
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 1;
  }
}

// Each frame shares one on-demand JPEG between all three of its captions.
export function createInstagramPhoto(frameId: string, source?: File) {
  const href = `/captions/${encodeURIComponent(frameId)}/instagram-photo`;
  let file: File | null = null;
  let request: Promise<File> | null = null;

  async function prepareFile() {
    let blob = source ? await jpegFromUpload(source).catch(() => null) : null;
    if (!blob) {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok || response.headers.get("Content-Type")?.split(";")[0] !== "image/jpeg") {
        throw new Error("Photo unavailable");
      }
      blob = await response.blob();
    }
    if (!blob.size) throw new Error("Empty photo");
    file = new File([blob], `furframe-${frameId}.jpg`, { type: "image/jpeg" });
    return file;
  }

  return {
    href,
    get file() { return file; },
    load() {
      request ??= prepareFile().catch((error: unknown) => {
        request = null;
        throw error;
      });
      return request;
    },
  };
}

type InstagramPhoto = ReturnType<typeof createInstagramPhoto>;

function hasMobileShare() {
  return window.matchMedia("(any-pointer: coarse)").matches
    && typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

export function warmInstagramPhoto(photo: InstagramPhoto) {
  void photo.load().catch(() => {});
}

type Phase = "closed" | "manual" | "preparing" | "ready" | "sharing" | "handedOff" | "cancelled" | "error";

const instructions: Record<Exclude<Phase, "closed">, string> = {
  manual: "In Instagram, choose Create, select your photo and paste your caption.",
  preparing: "Preparing your photo…",
  ready: "Your photo is ready. Tap Share photo and choose Instagram.",
  sharing: "Choose Instagram in the share menu.",
  handedOff: "Finish your post in the app you chose. If Instagram was missing, save the JPG and open Instagram below.",
  cancelled: "Sharing cancelled. Share again, or save the photo and open Instagram.",
  error: "Couldn’t share the photo. Save the JPG or select the original from your camera roll in Instagram.",
};

export function InstagramShare({ photo, caption }: { photo: InstagramPhoto; caption: string }) {
  const profileUrl = useInstagramProfileUrl();
  const [phase, setPhase] = useState<Phase>("closed");
  const [copyStatus, setCopyStatus] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const busy = phase === "sharing" || phase === "preparing";

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopyStatus("Caption copied.");
    } catch {
      setCopyStatus("Select the caption above and copy it to paste into Instagram.");
    }
  }

  async function downloadPhoto() {
    setDownloadStatus("Preparing your JPG…");
    try {
      const file = photo.file ?? await photo.load();
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
      setDownloadStatus("JPG download requested. If it doesn’t appear in Downloads, choose Save photo.");
    } catch {
      setDownloadStatus("Couldn’t prepare the JPG. Try Save photo again or use your original photo.");
    }
  }

  async function sharePhoto(file: File) {
    try {
      if (!navigator.canShare({ files: [file] })) {
        setPhase("manual");
        return;
      }
      setPhase("sharing");
      await navigator.share({ files: [file] });
      setPhase("handedOff");
    } catch (error) {
      setPhase(error instanceof Error && error.name === "AbortError" ? "cancelled" : "error");
    }
  }

  async function start(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (busy) {
      event.preventDefault();
      return;
    }
    if (!hasMobileShare() || (photo.file && !navigator.canShare({ files: [photo.file] }))) {
      void copyCaption();
      void downloadPhoto();
      setPhase("manual");
      return;
    }
    void copyCaption();
    setDownloadStatus("");
    event.preventDefault();
    if (photo.file) {
      await sharePhoto(photo.file);
      return;
    }
    setPhase("preparing");
    try {
      const file = await photo.load();
      // A slow export can outlive the tap that grants permission to share.
      if (navigator.userActivation?.isActive) await sharePhoto(file);
      else setPhase(navigator.canShare({ files: [file] }) ? "ready" : "manual");
    } catch {
      setPhase("error");
    }
  }

  const warm = () => warmInstagramPhoto(photo);
  const actionProps = { className: styles.instagramAction, onClick: start, onFocus: warm, onPointerEnter: warm, onPointerDown: warm };
  const label = <>
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="16" height="16" rx="4.5" /><circle cx="10" cy="10" r="3.5" />
      <circle cx="14.7" cy="5.4" r=".8" fill="currentColor" stroke="none" />
    </svg>
    Use on Instagram
  </>;
  return (
    <>
      {profileUrl
        ? <a {...actionProps} aria-disabled={busy || undefined} href={profileUrl} target="_blank" rel="noopener noreferrer">{label}</a>
        : <button {...actionProps} type="button" disabled={busy}>{label}</button>}
      {phase !== "closed" && (
        <div className={styles.instagramHelp}>
          <p role="status">{copyStatus} {downloadStatus} {phase === "manual" && !profileUrl ? "Add your Instagram profile to open it from Caption Club." : instructions[phase]}</p>
          <div className={styles.instagramLinks}>
            {phase === "ready" && <button type="button" onClick={() => { if (photo.file) void sharePhoto(photo.file); }}>Share photo</button>}
            <a href={photo.href} download onClick={(event) => {
              event.preventDefault();
              void downloadPhoto();
            }}>Save photo (JPG)</a>
            {profileUrl
              ? <a href={profileUrl} target="_blank" rel="noopener noreferrer">Open Instagram <span aria-hidden="true">↗</span></a>
              : <Link href="/profile#instagram">Add Instagram to My Profile</Link>}
          </div>
        </div>
      )}
    </>
  );
}
