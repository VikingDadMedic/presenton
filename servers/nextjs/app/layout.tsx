import type { Metadata } from "next";
import localFont from "next/font/local";
import { Syne } from "next/font/google";
import "./globals.css";
import "motion-icons-react/style.css";
import { Providers } from "./providers";
import MixpanelInitializer from "./MixpanelInitializer";
import { Toaster } from "@/components/ui/sonner";
const inter = localFont({
  src: [
    {
      path: "./fonts/Inter.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-inter",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://presenton.ai"),
  title: "TripStory - Travel experience builder",
  description:
    "TripStory is a visual travel experience builder that helps travel advisors and agents craft immersive destination presentations for their clients. Upload your content, choose a template, and let AI build a stunning visual story that sells trips.",
  keywords: [
    "AI presentation generator",
    "data storytelling",
    "data visualization tool",
    "AI data presentation",
    "presentation generator",
    "data to presentation",
    "interactive presentations",
    "professional slides",
  ],
  openGraph: {
    title: "TripStory - Travel experience builder",
    description:
      "TripStory is a visual travel experience builder that helps travel advisors and agents craft immersive destination presentations for their clients. Upload your content, choose a template, and let AI build a stunning visual story that sells trips.",
    url: "https://presenton.ai",
    siteName: "TripStory",
    images: [
      {
        url: "https://presenton.ai/presenton-feature-graphics.png",
        width: 1200,
        height: 630,
        alt: "TripStory Logo",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  alternates: {
    canonical: "https://presenton.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "TripStory - Travel experience builder",
    description:
      "TripStory is a visual travel experience builder that helps travel advisors and agents craft immersive destination presentations for their clients. Upload your content, choose a template, and let AI build a stunning visual story that sells trips.",
    images: ["https://presenton.ai/presenton-feature-graphics.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en" data-theme="light">
      <body
        className={`${inter.variable} ${syne.variable} antialiased`}
      >
        <Providers>
          <MixpanelInitializer>

            {children}

          </MixpanelInitializer>
        </Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
