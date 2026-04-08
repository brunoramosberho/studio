export type DeviceInfo = {
  os: "ios" | "android" | "other";
  browser: "safari" | "chrome" | "firefox" | "other";
  iosVersion: number | null;
  isInstalled: boolean;
  scenario:
    | "ios-safari-new"
    | "ios-safari"
    | "ios-chrome"
    | "android"
    | "installed"
    | "other";
};

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChromeIOS = /CriOS/.test(ua);
  const isSafari = isIOS && !isChromeIOS && /Safari/.test(ua);
  const iosVersion = isIOS
    ? parseInt(ua.match(/OS (\d+)_/)?.[1] || "0")
    : null;

  const isInstalled =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  if (isInstalled) {
    return {
      os: isIOS ? "ios" : "android",
      browser: isSafari ? "safari" : "chrome",
      iosVersion,
      isInstalled: true,
      scenario: "installed",
    };
  }

  if (isIOS && isChromeIOS) {
    return {
      os: "ios",
      browser: "chrome",
      iosVersion,
      isInstalled: false,
      scenario: "ios-chrome",
    };
  }

  if (isIOS && isSafari) {
    const scenario =
      iosVersion !== null && iosVersion >= 26
        ? "ios-safari-new"
        : "ios-safari";
    return { os: "ios", browser: "safari", iosVersion, isInstalled: false, scenario };
  }

  if (isAndroid) {
    return {
      os: "android",
      browser: "chrome",
      iosVersion: null,
      isInstalled: false,
      scenario: "android",
    };
  }

  return {
    os: "other",
    browser: "other",
    iosVersion: null,
    isInstalled: false,
    scenario: "other",
  };
}
