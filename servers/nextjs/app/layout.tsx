import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import MixpanelInitializer from "./MixpanelInitializer";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${cormorant.variable} ${dmMono.variable} min-h-screen bg-background text-foreground font-sans antialiased`}
      >
        <ThemeProvider attribute="data-theme" defaultTheme="light">
          <Providers>
            <MixpanelInitializer>

              {children}

            </MixpanelInitializer>
          </Providers>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
