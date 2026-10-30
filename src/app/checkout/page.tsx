import type { Metadata } from "next";
import { Checkout } from "@/components/checkout";

export const metadata: Metadata = { title: "Checkout | PreChop" };
export default function CheckoutPage() { return <Checkout />; }
