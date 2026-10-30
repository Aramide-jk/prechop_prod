import type { Metadata } from "next";
import { AccountApp } from "@/components/account-app";

export const metadata: Metadata = { title: "Account | PreChop" };
export default function Page() { return <AccountApp />; }
