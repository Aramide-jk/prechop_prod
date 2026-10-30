import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = { title: "Today | PreChop Admin" };

export default function AdminHomePage() {
  return <AdminDashboard />;
}
