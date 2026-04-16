import { Suspense } from "react";
import { headers } from "next/headers";
import { EmbedClassDetailClient } from "./embed-class-detail-client";

export const dynamic = "force-dynamic";

export default async function EmbedClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await headers();
  const host = h.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const tenantOrigin = `${protocol}://${host}`;

  return (
    <Suspense>
      <EmbedClassDetailClient classId={id} tenantOrigin={tenantOrigin} />
    </Suspense>
  );
}
