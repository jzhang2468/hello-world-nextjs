import type { Metadata } from "next";
import { Alfa_Slab_One, DM_Sans } from "next/font/google";
import "./globals.css";
const display = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
export const metadata: Metadata = {
  title: "FurFrame Studio — Everyday Pet Essentials",
  description:
    "Play dirty, live stylish. Explore Jennifer Zhang’s FurFrame Studio collection of colourful petwear and everyday accessories.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
