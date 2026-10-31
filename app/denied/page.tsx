import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
export default async function DeniedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("is_superadmin");
  if (!error && data === true) redirect("/");
  return <main className="gate"><section className="gate-card stack"><BrandMark /><h1>Superadmin access required.</h1><p className="muted">Signed in as {user.email}. This account cannot access the prompt chain tool.</p><LogoutButton /></section></main>;
}
