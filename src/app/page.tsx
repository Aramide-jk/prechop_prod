import { MenuApp } from "@/components/menu-app";
import { getCustomerMenu } from "@/lib/supabase/menu";

export const dynamic = "force-dynamic";

export default async function Home() {
  const liveConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const menuData = await getCustomerMenu(today, 7);
  return <MenuApp menuData={menuData} liveConfigured={liveConfigured} />;
}
