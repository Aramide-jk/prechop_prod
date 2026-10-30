import { notFound } from "next/navigation";
import { AdminModulePage, type AdminModuleKey } from "@/components/admin-module-page";

const sections = new Set<AdminModuleKey>([
  "menus", "meals", "add-ons", "batches", "orders", "deliveries", "refunds", "areas", "settings",
]);

export default async function AdminSectionPage({ params }: PageProps<"/admin/[section]">) {
  const { section } = await params;
  if (!sections.has(section as AdminModuleKey)) notFound();
  return <AdminModulePage section={section as AdminModuleKey} />;
}
