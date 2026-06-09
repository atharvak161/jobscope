import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "JobScope — UK Cybersecurity Job Tracker",
  description:
    "Personalised cybersecurity job feed with visa sponsorship and SC-clearance filtering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full bg-slate-50 font-sans text-slate-900">
        {children}
      </body>
    </html>
  );
}
