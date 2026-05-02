import { OnDemandDetailClient } from "./detail-client";

export const metadata = { title: "On-Demand" };

export default async function OnDemandVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OnDemandDetailClient videoId={id} />;
}
