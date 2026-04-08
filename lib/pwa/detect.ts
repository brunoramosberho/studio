export type DeviceInfo = {
  os: "ios" | "android" | "other";
  browser: "safari" | "chrome" | "firefox" | "other";
  iosVersion: number | null;
  isIPad: boolean;
  isInstalled: boolean;
  scenario:
    | "ios-safari-new"
    | "ios-safari"
    | "ios-safari-ipad"
    | "ios-chrome"
    | "android"
    | "installed"
    | "other";
};

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;

  // iPad detection: iPadOS 13+ reports as "Macintosh" in the UA
  const isIPadUA = /iPad/.test(ua);
  const isIPadDesktopMode =
    /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const isIPad = isIPadUA || isIPadDesktopMode;

  const isIPhone = /iPhone|iPod/.test(ua);
  const isIOS = isIPhone || isIPad;
  const isAndroid = /Android/.test(ua);
  const isChromeIOS = /CriOS/.test(ua);
  const isSafari = isIOS && !isChromeIOS && /Safari/.test(ua);

  // iOS version: from "OS XX_X" (iPhone) or "Version/XX" (iPad desktop mode)
  let iosVersion: number | null = null;
  if (isIOS) {
    const osMatch = ua.match(/OS (\d+)[_\s]/);
    if (osMatch) {
      iosVersion = parseInt(osMatch[1]);
    } else if (isIPadDesktopMode) {
      const versionMatch = ua.match(/Version\/(\d+)/);
      if (versionMatch) iosVersion = parseInt(versionMatch[1]);
    }
  }

  const isInstalled =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  if (isInstalled) {
    return {
      os: isIOS ? "ios" : "android",
      browser: isSafari ? "safari" : "chrome",
      iosVersion,
      isIPad,
      isInstalled: true,
      scenario: "installed",
    };
  }

  if (isIOS && isChromeIOS) {
    return {
      os: "ios",
      browser: "chrome",
      iosVersion,
      isIPad,
      isInstalled: false,
      scenario: "ios-chrome",
    };
  }

  if (isIOS && isSafari) {
    let scenario: DeviceInfo["scenario"];
    if (iosVersion !== null && iosVersion >= 26) {
      scenario = "ios-safari-new";
    } else if (isIPad) {
      scenario = "ios-safari-ipad";
    } else {
      scenario = "ios-safari";
    }
    return { os: "ios", browser: "safari", iosVersion, isIPad, isInstalled: false, scenario };
  }

  if (isAndroid) {
    return {
      os: "android",
      browser: "chrome",
      iosVersion: null,
      isIPad: false,
      isInstalled: false,
      scenario: "android",
    };
  }

  return {
    os: "other",
    browser: "other",
    iosVersion: null,
    isIPad: false,
    isInstalled: false,
    scenario: "other",
  };
}
