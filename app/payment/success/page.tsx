import { redirect } from "next/navigation";

type SearchParams = Promise<{
  redirect_status?: string;
  payment_intent?: string;
}>;

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { redirect_status } = await searchParams;

  if (redirect_status === "succeeded" || redirect_status === "processing") {
    redirect("/my/packages?payment=success");
  }

  redirect("/my/packages?payment=failed");
}
