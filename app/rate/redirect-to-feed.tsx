"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RedirectToFeed({ classId }: { classId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/feed/new?from=rating&classId=${classId}`);
  }, [classId, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-muted">Redirigiendo...</p>
      </div>
    </div>
  );
}
