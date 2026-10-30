import type { Metadata } from "next";
import { AdminAbandonedPayments } from "@/components/admin-abandoned-payments";

export const metadata: Metadata = { title: "Unfinished payments | PreChop Admin" };

export default function AdminAbandonedPaymentsPage() {
  return <AdminAbandonedPayments />;
}
