import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/tenant";

// The billing page drives Stripe Connect onboarding + the SaaS subscription.
// It has no dedicated admin API to gate (it calls shared /api/stripe/* routes),
// so enforce the "billing" permission at the page boundary: a customized admin
// without "billing" is redirected instead of loading the section.
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePermission("billing");
  } catch {
    redirect("/admin");
  }
  return <>{children}</>;
}
