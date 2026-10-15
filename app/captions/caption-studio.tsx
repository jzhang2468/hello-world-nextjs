"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { generateCaptionSet, voteOnCaption } from "./actions";
import { captionFeedHref, captionFrameHref, isCaptionFrameId, CAPTION_PAGE_SIZE, type CaptionCard, type CaptionFeedMode, type CaptionImage, type CaptionTone, type GenerationState, type VoteResult } from "@/lib/caption-types";
import { CAPTION_PHOTO_ACCEPT, captionPhotoError, isHeicPhoto, prepareCaptionPhoto } from "@/lib/caption-photo-upload";
import styles from "./captions.module.css";

const TONES: { value: CaptionTone; label: string; note: string; symbol: string }[] = [
  { value: "deadpan", label: "Deadpan", note: "Zero expression. All attitude.", symbol: "−" },
  { value: "chaotic", label: "Chaotic", note: "A little off the leash.", symbol: "✳" },
  { value: "wholesome", label: "Wholesome", note: "Big heart. Small punchline.", symbol: "♡" },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function CameraIcon() {
  return <svg aria-hidden="true" width="43" height="36" viewBox="0 0 43 36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 9h8l3-6h13l3 6h8v23H4z" /><circle cx="21.5" cy="20" r="7.5" /><path d="M33 13h3M0 36h43" /></svg>;
}

function LaughIcon({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="10" cy="10" r="8" /><path d="M7 7h.01M13 7h.01" strokeWidth="2.5" /><path d={down ? "M6.8 12h6.4" : "M6 11.5c.5 2 2 3 4 3s3.5-1 4-3"} /></svg>;
}

function CaptionBallot({ caption, number, frameId }: { caption: CaptionCard; number: number; frameId: string }) {
  const [result, setResult] = useState<VoteResult>({});
  const [shareFeedback, setShareFeedback] = useState("");
  const [sharing, setSharing] = useState(false);
  const [pending, startTransition] = useTransition();
  const vote = result.myVote ?? caption.myVote;
  const upvotes = result.upvotes ?? caption.upvotes;
  const downvotes = result.downvotes ?? caption.downvotes;

  function submitVote(value: 1 | -1) {
    if (pending || vote === value) return;
    startTransition(async () => {
      try {
        const next = await voteOnCaption(caption.id, value);
        setResult((previous) => next.error ? { ...previous, error: next.error } : next);
      } catch {
        setResult((previous) => ({ ...previous, error: "Your vote didn’t save. Please try again." }));
      }
    });
  }

  async function shareCaption(copyOnly: boolean) {
    if (sharing) return;
    setSharing(true);
    setShareFeedback("");
    try {
      if (copyOnly) {
        await navigator.clipboard.writeText(caption.text);
        setShareFeedback("Caption copied.");
      } else {
        const url = new URL(captionFrameHref(frameId), window.location.origin).href;
        if (navigator.share) {
          try {
            await navigator.share({ title: "A little FurFrame funny business", text: caption.text, url });
            setShareFeedback("Share completed.");
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            // Some browsers expose Web Share but cannot open a share sheet.
            // Fall back to the same durable member link, never the signed image URL.
          }
        }
        await navigator.clipboard.writeText(`${caption.text}\n${url}`);
        setShareFeedback("Caption and member link copied.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareFeedback("Couldn’t copy or share. Select the caption text to copy it, or use the frame link below.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className={`${styles.ballot} ${vote === 1 ? styles.likedBallot : ""}`} aria-busy={pending}>
      <div className={styles.ballotText}><span className={styles.captionNumber}>0{number}</span><p>{caption.text}</p></div>
      <div className={styles.voteRow} role="group" aria-label={`Rate caption ${number}: ${caption.text}`}>
        <button type="button" aria-pressed={vote === 1} disabled={pending} onClick={() => submitVote(1)} className={vote === 1 ? styles.selectedVote : ""}>
          <LaughIcon /><span>Made me laugh</span><b aria-label={`${upvotes} positive votes`}>{upvotes}</b>
        </button>
        <button type="button" aria-pressed={vote === -1} disabled={pending} onClick={() => submitVote(-1)} className={vote === -1 ? styles.selectedVote : ""}>
          <LaughIcon down /><span>Not quite</span><b aria-label={`${downvotes} negative votes`}>{downvotes}</b>
        </button>
        <span className={styles.voteFeedback} role="status">{pending ? "Saving…" : vote ? "Vote saved ✓" : ""}</span>
      </div>
      {result.error && <p className={styles.voteError} role="alert">{result.error}</p>}
      <div className={styles.captionActions} role="group" aria-label={`Use caption ${number}`}>
        <button type="button" disabled={sharing} onClick={() => void shareCaption(true)}>Copy caption</button>
        <button type="button" disabled={sharing} onClick={() => void shareCaption(false)}>Share caption <Arrow diagonal /></button>
        <span role="status" aria-live="polite">{shareFeedback}</span>
      </div>
    </div>
  );
}

function PhotoSet({ item, number, fresh }: { item: CaptionImage; number: number; fresh: boolean }) {
  const date = new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <article className={`${styles.photoSet} ${fresh ? styles.freshFrame : ""}`} id={`frame-${item.id}`} tabIndex={-1} aria-label={`Photo ${number}, ${item.tone} captions`}>
      <div className={styles.feedPrint}>
        <div className={styles.printTop}><span>FURFRAME / {String(number).padStart(2, "0")}</span><span>{item.ownedByMe ? "YOUR FRAME" : "CLUB FRAME"}</span></div>
        <div className={styles.feedPhoto}><Image src={item.imageUrl} alt={item.description} fill unoptimized sizes="(max-width: 760px) 90vw, 38vw" /></div>
        <div className={styles.printBottom}><span>{date}</span><span aria-hidden="true">✳</span><span>{item.tone.toUpperCase()}</span></div>
      </div>
      <div className={styles.captionPanel}>
        <div className={styles.captionPanelHeading}><span className={styles.eyebrow}>ONE FRAME. THREE TAKES.</span><span className={styles.aiTag}>AI-written</span></div>
        <h3>Which one lands?</h3>
        <div>{item.captions.map((caption, index) => <CaptionBallot key={`${caption.id}:${caption.upvotes}:${caption.downvotes}:${caption.myVote}`} caption={caption} number={index + 1} frameId={item.id} />)}</div>
        <div className={styles.frameLink}><Link href={captionFrameHref(item.id)} prefetch={false}>Link to this frame <Arrow diagonal /></Link><span>Photo links open for signed-in members.</span></div>
        <details className={styles.description}><summary>What the AI noticed <span aria-hidden="true">+</span></summary><p>{item.description}</p></details>
      </div>
    </article>
  );
}

function ExampleFrames() {
  return (
    <div className={styles.examples} aria-label="Handwritten examples, not generated results">
      <article className={styles.exampleCard}>
        <div className={styles.exampleImage}><Image src="/images/blue-vest-walk.jpg" alt="A person carrying a dog wearing a blue vest alongside a skateboard" fill sizes="(max-width: 640px) 85vw, 34vw" /></div>
        <div className={styles.exampleCopy}><span className={styles.exampleLabel}>HANDWRITTEN EXAMPLE / DEADPAN</span><p>My personal trainer insists on carrying me.</p><span className={styles.exampleFootnote}>A little inspiration. Upload yours to make it real.</span></div>
      </article>
      <article className={styles.exampleCard}>
        <div className={styles.exampleImage}><Image src="/images/pink-vest-walk.jpg" alt="A person carrying a dog in a pink vest under an umbrella" fill sizes="(max-width: 640px) 85vw, 34vw" /></div>
        <div className={styles.exampleCopy}><span className={styles.exampleLabel}>HANDWRITTEN EXAMPLE / CHAOTIC</span><p>I ordered a walk. This is clearly business class.</p><span className={styles.exampleFootnote}>The photo does half the work. You judge the rest.</span></div>
      </article>
    </div>
  );
}

export default function CaptionStudio({ signedIn, generationConfigured, items, feedError, mode, page, hasMore, requestedFrameId, selectedFrame, selectedFrameError }: {
  signedIn: boolean;
  generationConfigured: boolean;
  items: CaptionImage[];
  feedError: string | null;
  mode: CaptionFeedMode;
  page: number;
  hasMore: boolean;
  requestedFrameId: string | null;
  selectedFrame: CaptionImage | null;
  selectedFrameError: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const rejectionDialogRef = useRef<HTMLDialogElement>(null);
  const focusedFrame = useRef<string | null>(null);
  const photoSelection = useRef(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [tone, setTone] = useState<CaptionTone>("deadpan");
  const [petPhotoRejection, setPetPhotoRejection] = useState<string | null>(null);
  const [petRejectionDismissed, setPetRejectionDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [state, formAction, pending] = useActionState<GenerationState, FormData>(async (previous, formData) => {
    setPetRejectionDismissed(false);
    if (converting) return { error: "Your photo is still being converted. Please wait a moment." };
    if (photoError) return { error: photoError };
    if (!photo) return { error: "Choose a photo first. Every good caption needs a frame." };
    formData.set("image", photo);
    formData.set("tone", tone);
    try {
      const next = await generateCaptionSet(previous, formData);
      if (next.errorCode === "PET_PHOTO_REQUIRED") {
        clearPhoto();
        setPetPhotoRejection(next.error ?? "Only pet-related photos can be used to generate captions. Please choose a photo of your pet or pet-related items.");
      } else if (next.success) {
        setPhoto(null);
        setPreview(null);
        setConverted(false);
        if (next.imageId) router.push(captionFrameHref(next.imageId));
        if (inputRef.current) inputRef.current.value = "";
      }
      return next;
    } catch {
      return { error: "The studio hit a snag. Please try again in a moment." };
    }
  }, {});

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { photoSelection.current += 1; }, []);
  useEffect(() => {
    const dialog = rejectionDialogRef.current;
    if (petPhotoRejection && !pending && dialog && !dialog.open) dialog.showModal();
  }, [petPhotoRejection, pending]);
  useEffect(() => {
    const id = selectedFrame?.id ?? state.imageId;
    if (id && focusedFrame.current !== id) {
      const frame = document.getElementById(`frame-${id}`);
      (frame ?? resultRef.current)?.focus();
      if (frame) focusedFrame.current = id;
    }
  }, [selectedFrame?.id, state.imageId, items]);
  useEffect(() => {
    try {
      if (!signedIn) {
        if (requestedFrameId) sessionStorage.setItem("furframe-pending-frame", requestedFrameId);
        return;
      }
      const remembered = sessionStorage.getItem("furframe-pending-frame");
      sessionStorage.removeItem("furframe-pending-frame");
      if (!requestedFrameId && isCaptionFrameId(remembered)) router.replace(captionFrameHref(remembered));
    } catch {
      // Storage may be disabled. The original member link still works after sign-in.
    }
  }, [signedIn, requestedFrameId, router]);

  const visibleItems = selectedFrame ? items.filter((item) => item.id !== selectedFrame.id) : items;
  const chosenTone = TONES.find((option) => option.value === tone)!;
  // Replacing a rejected photo resolves that photo's warning, not a service or
  // save failure. Every new submission can still report a fresh rejection.
  const generationError = state.errorCode === "PET_PHOTO_REQUIRED" && petRejectionDismissed ? undefined : state.error;

  function rememberSharedFrame() {
    try {
      if (requestedFrameId) sessionStorage.setItem("furframe-pending-frame", requestedFrameId);
    } catch {
      // Do not block sign-in when browser storage is unavailable.
    }
  }

  async function choosePhoto(file?: File) {
    if (!file) return;
    const selection = ++photoSelection.current;
    setPhotoError("");
    setPhoto(null);
    setPreview(null);
    setConverted(false);
    const error = captionPhotoError(file);
    if (error) {
      setPhotoError(error);
      setConverting(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setConverting(isHeicPhoto(file));
    try {
      const prepared = await prepareCaptionPhoto(file);
      if (photoSelection.current !== selection) return;
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
      setConverted(isHeicPhoto(file));
      if (state.errorCode === "PET_PHOTO_REQUIRED") setPetRejectionDismissed(true);
    } catch (error) {
      if (photoSelection.current !== selection) return;
      setPhotoError(error instanceof Error ? error.message : "We couldn’t prepare that photo. Please try another.");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      if (photoSelection.current === selection) setConverting(false);
    }
  }

  function clearPhoto() {
    photoSelection.current += 1;
    setPhoto(null);
    setPreview(null);
    setPhotoError("");
    setConverting(false);
    setConverted(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className={styles.studio}>
      <dialog ref={rejectionDialogRef} className={styles.petPhotoDialog} role="alertdialog" aria-labelledby="pet-photo-dialog-title" aria-describedby="pet-photo-dialog-message" onClose={() => {
        setPetPhotoRejection(null);
        inputRef.current?.focus();
      }}>
        <span className={styles.dialogStamp} aria-hidden="true">✳</span>
        <p className={styles.eyebrow}>THE FURFRAME PHOTO LAB</p>
        <h2 id="pet-photo-dialog-title">A pet photo, please.</h2>
        <p id="pet-photo-dialog-message" className={styles.dialogMessage}>{petPhotoRejection}</p>
        <p className={styles.dialogNote}>Your selected photo has been cleared. Pick a new one to try again.</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.darkButton} onClick={() => {
            rejectionDialogRef.current?.close();
            inputRef.current?.focus();
            inputRef.current?.click();
          }}>Choose a pet photo <Arrow diagonal /></button>
          <button type="button" className={styles.textLink} onClick={() => rejectionDialogRef.current?.close()}>Close</button>
        </div>
      </dialog>
      <section className={styles.hero} aria-labelledby="caption-title">
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}><span aria-hidden="true">✳</span> THE FURFRAME CAPTION CLUB</p>
          <h1 id="caption-title">Cute photos of your pets? <span>Make it even cuter with our caption generator!</span></h1>
          <p className={styles.heroDescription}>A very unserious place for your very good photos. Bring a frame. We’ll find the punchlines. You decide what’s funny.</p>
          <div className={styles.heroActions}><a href="#caption-workbench" className={styles.darkButton}>Make a little mischief <Arrow diagonal /></a><a href="#caption-gallery" className={styles.textLink}>Explore the frames <Arrow /></a></div>
          <p className={styles.heroFinePrint}>YOUR PHOTO <span>→</span> THREE AI CAPTIONS <span>→</span> THE CLUB’S VERDICT</p>
        </div>
        <div className={styles.heroArt}>
          <div className={styles.photoBacking} aria-hidden="true"><span>GOOD DOG.<br />BAD INFLUENCE.</span></div>
          <figure className={styles.heroPrint}>
            <div className={styles.tape} aria-hidden="true" />
            <div className={styles.heroPhoto}><Image src="/images/biscuit-cotton-vest-pink.jpg" alt="A small white dog in a pink vest poses on a display table" fill priority sizes="(max-width: 760px) 70vw, 28vw" /></div>
            <figcaption><small>HANDWRITTEN EXAMPLE</small><span>Head of treats.<br />Zero qualifications.</span></figcaption>
          </figure>
          <span className={styles.roundStamp} aria-hidden="true"><span>VERY GOOD</span><b>✳</b><span>VERY SILLY</span></span>
          <span className={styles.marginNote}>Exhibit A: main character energy. <span aria-hidden="true">↖</span></span>
        </div>
      </section>

      <div className={styles.ticker} aria-hidden="true"><span>TAKE IT LIGHTLY</span><b>✳</b><span>MAKE IT FUNNY</span><b>✳</b><span>PASS IT ON</span><b>✳</b><span>TAKE IT LIGHTLY</span><b>✳</b><span>MAKE IT FUNNY</span></div>

      <section id="caption-workbench" className={styles.workbench} aria-labelledby="workbench-title">
        <div className={styles.workbenchHeading}><div><p className={styles.eyebrow}>01 / THE PHOTO LAB</p><h2 id="workbench-title">Let’s develop<br />a sense of humour.</h2></div><p>That camera-roll gem deserves<br />a better caption than “mood.”</p></div>
        <form action={formAction} className={styles.generator} aria-label="Generate captions from a photo" aria-busy={pending || converting}>
          <div className={styles.uploadColumn}>
            <div className={`${styles.dropzone} ${dragging ? styles.dragging : ""} ${preview ? styles.hasPhoto : ""}`} onDragOver={(event) => { event.preventDefault(); if (signedIn && !pending && !converting) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
              event.preventDefault(); setDragging(false);
              if (signedIn && !pending && !converting) void choosePhoto(event.dataTransfer.files[0]);
            }}>
              {preview ? <Image src={preview} alt="Your selected photo, ready for captions" fill unoptimized sizes="(max-width: 760px) 85vw, 38vw" /> : <div className={styles.uploadPlaceholder}><CameraIcon /><p>A little chaos<br />from your camera roll.</p><span>Drop a photo here or choose a file.</span></div>}
              <input ref={inputRef} id="caption-image" className={styles.fileInput} type="file" name="image" accept={CAPTION_PHOTO_ACCEPT} aria-describedby="caption-pet-help caption-file-help caption-file-error caption-conversion-status" disabled={!signedIn || pending || converting} onChange={(event) => { void choosePhoto(event.target.files?.[0]); }} />
              {signedIn ? <label className={styles.uploadButton} htmlFor="caption-image" aria-disabled={pending || converting}>{converting ? "Preparing your photo…" : photo ? "Choose another photo" : "Choose a photo"}<Arrow diagonal /></label> : <Link className={styles.uploadButton} href="/login" onClick={rememberSharedFrame}>Sign in to add your photo <Arrow diagonal /></Link>}
              <span className={styles.photoCorner} aria-hidden="true">+<span>+</span></span>
            </div>
            <p id="caption-pet-help" className={styles.petPhotoHint}>Pets and pet-related items only. Think furry friends, favourite toys, or pet gear.</p>
            <div className={styles.fileDetails}><p id="caption-file-help">JPEG, PNG, WEBP, HEIC / HEIF · UP TO 3 MB</p>{photo && <button type="button" onClick={clearPhoto} disabled={pending}>Remove photo ×</button>}</div>
            <p id="caption-conversion-status" className={styles.filename} role="status">{converting ? "Converting your iPhone photo…" : converted ? "HEIC converted to JPEG. Your photo is ready." : ""}</p>
            {photo && <p className={styles.filename}>{photo.name}</p>}
            <p id="caption-file-error" className={styles.formError} role={photoError ? "alert" : undefined}>{photoError}</p>
          </div>
          <div className={styles.generateControls}>
            <fieldset className={styles.tones} disabled={!signedIn || pending}>
              <legend>Pick your flavour.</legend>
              <p>Same photo. Different personality.</p>
              <div className={styles.toneChoices}>{TONES.map((option) => <label key={option.value} className={`${styles.toneChip} ${tone === option.value ? styles.chosenTone : ""}`}><input type="radio" name="tone" value={option.value} checked={tone === option.value} onChange={() => setTone(option.value)} /><span aria-hidden="true">{option.symbol}</span>{option.label}</label>)}</div>
              <p className={styles.toneNote}>{chosenTone.note}</p>
            </fieldset>
            <div className={styles.processNote}><span aria-hidden="true">↳</span><p>First, AI checks for pets or pet-related items.<br />Then it turns those details into three captions.</p></div>
            <p className={styles.sharingNote}>Your photo and captions will be shared with signed-in club members. Only upload photos you have permission to share.</p>
            {!signedIn ? <Link href="/login" onClick={rememberSharedFrame} className={styles.darkButton}>Sign in & join the fun <Arrow diagonal /></Link> : <>
              {!generationConfigured && <p className={styles.unavailableNotice}>The photo lab is taking a short break. You can still explore and rate the club’s captions.</p>}
              <button className={styles.darkButton} type="submit" disabled={pending || converting || !photo || Boolean(photoError) || !generationConfigured}><span>{converting ? "Preparing your photo…" : pending ? "Checking photo & making captions…" : "Develop my captions"}</span><span className={pending || converting ? styles.workingStar : ""} aria-hidden="true">✳</span></button>
            </>}
            <div className={styles.generationFeedback} ref={resultRef} tabIndex={-1} aria-live="polite">
              {pending && <p>Checking for a pet or pet-related items before writing your captions. This can take a moment.</p>}
              {generationError && !pending && <p className={styles.formError} role="alert">{generationError}</p>}
              {state.success && !pending && <p className={styles.formSuccess} role="status">{state.success} <Link href={state.imageId ? captionFrameHref(state.imageId) : "#caption-gallery"}>See your captions ↓</Link></p>}
            </div>
          </div>
        </form>
      </section>

      <section id="caption-gallery" className={styles.gallery} aria-labelledby="gallery-title">
        <div className={styles.galleryHeading}><div><p className={styles.eyebrow}>02 / THE CONTACT SHEET</p><h2 id="gallery-title">The frames.<br /><span>The funny business.</span></h2></div><div className={styles.galleryNote}><span aria-hidden="true">☺</span><p>Good one? Let them know.<br />Every caption gets its own vote.</p></div></div>
        {!signedIn && requestedFrameId && <div className={styles.sharedNotice} id={`frame-${requestedFrameId}`}><p>This frame is waiting inside the club. Sign in to see the photo and its captions.</p><Link href="/login" onClick={rememberSharedFrame} className={styles.textLink}>Sign in to view shared frame <Arrow /></Link><span>If this frame doesn’t reopen after sign-in, open the link again.</span></div>}
        {selectedFrameError && <p className={styles.feedError} role="status">{selectedFrameError}</p>}
        {signedIn && selectedFrame && <section className={styles.selectedFrame} aria-label="Selected frame"><p className={styles.eyebrow}>{state.imageId === selectedFrame.id ? "YOUR NEW FRAME" : "THE FRAME YOU OPENED"}</p><PhotoSet item={selectedFrame} number={1} fresh={state.imageId === selectedFrame.id} /></section>}
        <div className={styles.galleryToolbar}><nav className={styles.filters} aria-label="Browse caption photos"><Link href={captionFeedHref("fresh")} prefetch={false} aria-current={mode === "fresh" ? "page" : undefined}>Fresh frames</Link>{signedIn && <><Link href={captionFeedHref("top")} prefetch={false} aria-current={mode === "top" ? "page" : undefined}>Top frames</Link><Link href={captionFeedHref("mine")} prefetch={false} aria-current={mode === "mine" ? "page" : undefined}>My frames</Link></>}</nav><span className={styles.galleryAccess}>{signedIn ? "MEMBERS’ CONTACT SHEET" : "A PEEK INSIDE THE CLUB"}</span></div>
        {signedIn && <p className={styles.feedExplanation}>{mode === "top" ? "Ranked by positive minus negative votes across each photo’s three captions. Newer frames break a tie." : mode === "mine" ? "Your own photo history, newest first. Come back to see how your captions land." : "The club’s newest photos, with a fresh chance to make someone laugh."}</p>}
        {feedError && signedIn && <p className={styles.feedError} role="alert">{feedError}</p>}
        {signedIn && visibleItems.length > 0 ? <div className={styles.feed}>{visibleItems.map((item, index) => <PhotoSet item={item} key={item.id} number={(page - 1) * CAPTION_PAGE_SIZE + index + 1} fresh={state.imageId === item.id} />)}</div> : <>
          {signedIn && (mode === "mine" || page > 1 || selectedFrame || feedError) ? <div className={styles.emptyState}><span aria-hidden="true">▧</span><h3>{feedError ? "A moment in the darkroom." : selectedFrame && items.length ? "You’re caught up on this page." : page > 1 ? "No more frames on this page." : "Your first frame is waiting."}</h3><p>{feedError ? "Your frames couldn’t load. Refresh the page to try again." : selectedFrame && items.length ? "The frame above is part of this page. Explore another view or add your own." : "Upload a photo and give the club something to smile about."}</p>{!feedError && <a className={styles.textLink} href="#caption-workbench">Make a frame <Arrow /></a>}</div> : <><div className={styles.exampleIntro}><p>{signedIn && !feedError ? "The contact sheet is ready for its first real frame." : "A little taste of what’s possible."}</p><span>{signedIn ? "Handwritten examples for inspiration. Your photos will appear here." : "These are handwritten examples. Sign in to generate and rate real captions."}</span></div><ExampleFrames /></>}
        </>}
        {signedIn && (page > 1 || hasMore) && <nav className={styles.pagination} aria-label="Caption gallery pages">{page > 1 ? <Link href={captionFeedHref(mode, page - 1)} prefetch={false}>← Previous page</Link> : <span />}<span>Page {page}</span>{hasMore ? <Link href={captionFeedHref(mode, page + 1)} prefetch={false}>Next page →</Link> : <span />}</nav>}
        {!signedIn && <div className={styles.joinNote}><p>The good stuff happens in the club.</p><Link href="/login" onClick={rememberSharedFrame} className={styles.textLink}>Sign in to see real frames & cast your vote <Arrow diagonal /></Link></div>}
        {signedIn && visibleItems.length > 0 && <p className={styles.bottomNote}>Funny is subjective. Your vote is yours. Change your mind any time.</p>}
      </section>
      <section className={styles.closingNote} aria-label="A note from the studio"><span aria-hidden="true">✳</span><p>A little less serious.<br /><b>A little more FurFrame.</b></p><a href="#caption-workbench" aria-label="Back to the photo lab">↗</a></section>
    </main>
  );
}
