import type { Metadata } from "next";
import { CampaignApp } from "@/components/campaign-app";

export const metadata: Metadata = { title: "Invite friends | PreChop" };

export default function CampaignPage() {
  return <CampaignApp />;
}
