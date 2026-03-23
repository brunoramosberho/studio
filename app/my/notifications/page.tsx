"use client";

import { Bell } from "lucide-react";
import { PageTransition } from "@/components/shared/page-transition";

export default function NotificationsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Notificaciones
        </h1>
        <div className="mt-12 flex flex-col items-center text-center">
          <Bell className="h-12 w-12 text-muted/30" />
          <p className="mt-4 font-display text-lg font-semibold text-foreground">
            Sin notificaciones
          </p>
          <p className="mt-1 text-sm text-muted">
            Aquí verás cuando alguien interactúe con tu actividad
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
