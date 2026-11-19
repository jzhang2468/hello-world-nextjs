"use client";

import { createContext, useContext, type ReactNode } from "react";
import { instagramProfileUrl } from "@/lib/instagram-profile";

const InstagramDestination = createContext<string | null>(null);

export function InstagramProfileProvider({ username, children }: { username: string | null; children: ReactNode }) {
  return <InstagramDestination.Provider value={username ? instagramProfileUrl(username) : null}>{children}</InstagramDestination.Provider>;
}

export function useInstagramProfileUrl() {
  return useContext(InstagramDestination);
}
