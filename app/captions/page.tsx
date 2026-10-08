import type { Metadata } from "next";
import AccountShell from "../components/account-shell";
import { getAuthContext } from "@/lib/auth";
import { getCaptionFeed, getCaptionServiceStatus } from "@/lib/captions";
import CaptionStudio from "./caption-studio";
import { captionFeedOptions, getDailyCaptionPrompt } from "@/lib/caption-types";

export const metadata: Metadata = {
  title: "Caption Club · FurFrame Studio",
  description: "Cute photos of your pets? Make it even cuter with our caption generator! Turn everyday moments into three AI-written punchlines, then let the club decide what lands.",
};

// Both steps of the image-to-caption chain run inside the generation action.
export const runtime = "nodejs";
export const maxDuration = 90;

export default async function CaptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const options = captionFeedOptions(query);
  const { user } = await getAuthContext();
  const [feed, service] = await Promise.all([
    user ? getCaptionFeed(options) : Promise.resolve({ items: [], error: null, selectedFrame: null, selectedFrameError: null, hasMore: false }),
    getCaptionServiceStatus(),
  ]);

  return (
    <AccountShell signedIn={Boolean(user)} current="captions">
      <CaptionStudio
        signedIn={Boolean(user)}
        generationConfigured={service.configured}
        items={feed.items}
        feedError={feed.error}
        mode={options.mode}
        page={options.page}
        hasMore={feed.hasMore}
        requestedFrameId={options.frameId}
        selectedFrame={feed.selectedFrame}
        selectedFrameError={query.frame && !options.frameId ? "That frame link is not valid. Browse the club below." : feed.selectedFrameError}
        dailyPrompt={getDailyCaptionPrompt()}
      />
    </AccountShell>
  );
}
