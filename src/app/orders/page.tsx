import type { Metadata } from "next";
import { Orders } from "@/components/orders";

export const metadata: Metadata = { title: "My Orders | PreChop" };
export default function OrdersPage() { return <Orders />; }
