import type { Metadata } from "next";
import { WalletPage } from "@/components/wallet";

export const metadata: Metadata = { title: "Wallet | PreChop" };
export default function Page() { return <WalletPage />; }
