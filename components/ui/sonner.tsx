"use client";

import { Toaster } from "sonner";

export function Sonner() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "border border-border/60 bg-white text-foreground shadow-warm",
          description: "text-muted",
        },
      }}
    />
  );
}

