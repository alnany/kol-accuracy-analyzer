import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOLOL — KOL Accuracy Analyzer",
  description:
    "Does your crypto influencer actually know what they're talking about? Score any KOL's prediction accuracy with real price data.",
  openGraph: {
    title: "KOLOL — KOL Accuracy Analyzer",
    description:
      "Score any crypto influencer's prediction accuracy with real price data.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg antialiased">{children}</body>
    </html>
  );
}
