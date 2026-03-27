/** True when opened as installed PWA (pantalla de inicio) o modo equivalente. */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type MobileInstallPlatform = "ios" | "android" | null;

/** Móvil donde tiene sentido “Agregar a inicio”; null en desktop. */
export function getMobileInstallPlatform(): MobileInstallPlatform {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}
