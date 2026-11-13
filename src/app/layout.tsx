import type { Metadata } from "next";
import { CustomerNavigation } from "@/components/customer-navigation";
import { CampaignAnnouncement } from "@/components/campaign-announcement";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./sign-in.css";
import "./menu.css";
import "./payment.css";
import "./orders.css";
import "./wallet.css";
import "./account.css";
import "./navigation.css";
import "./skeletons.css";
import "./campaign.css";
import "./admin.css";
import "./admin-dashboard.css";
import "./legal.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PreChop — Your meals, planned",
  description: "Plan your meals for delivery across ABU and Sabon Gari, Zaria.",
  icons: { icon: "/images/favicon.jpeg", shortcut: "/images/favicon.jpeg", apple: "/images/favicon.jpeg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><CustomerNavigation /><CampaignAnnouncement />{children}</body>
    </html>
  );
}
