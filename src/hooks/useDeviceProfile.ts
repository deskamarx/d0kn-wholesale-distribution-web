import { useEffect, useState } from "react";

export type DeviceClass = "mobile" | "tablet" | "desktop";
export type PreviewMode = "auto" | DeviceClass;
export type LayoutKind = "bottom-nav" | "compact-rail" | "sidebar";

export interface DeviceSnapshot {
  detected: DeviceClass;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  pointer: "coarse" | "fine";
  touch: boolean;
  userAgentHint: string;
}

export interface DeviceDisplayInfo extends DeviceSnapshot {
  effective: DeviceClass;
  detectedLabel: string;
  effectiveLabel: string;
  detectedLayout: LayoutKind;
  detectedLayoutLabel: string;
  layout: LayoutKind;
  layoutLabel: string;
}

const PREVIEW_KEY = "d0kn-distribution-preview-v1";

const LAYOUT_BY_CLASS: Record<DeviceClass, { layout: LayoutKind; label: string }> = {
  mobile: { layout: "bottom-nav", label: "Bottom navigation" },
  tablet: { layout: "compact-rail", label: "Compact rail" },
  desktop: { layout: "sidebar", label: "Full sidebar" },
};

const LABEL_BY_CLASS: Record<DeviceClass, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
};

function readPreview(): PreviewMode {
  try {
    const value = window.localStorage.getItem(PREVIEW_KEY);
    if (value === "mobile" || value === "tablet" || value === "desktop") return value;
  } catch {
    // Storage can be unavailable in private browsing; auto detection still works.
  }
  return "auto";
}

function userAgentHint(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/ipad/.test(ua) || (/macintosh/.test(ua) && /safari/.test(ua))) return "iPad / tablet Safari";
  if (/iphone/.test(ua)) return "iPhone";
  if (/android/.test(ua) && /tablet|kindle|silk/.test(ua)) return "Android tablet";
  if (/android/.test(ua)) return "Android phone";
  if (/windows phone/.test(ua)) return "Windows phone";
  return "Desktop browser";
}

function classify(width: number, pointer: "coarse" | "fine", hint: string, touch: boolean): DeviceClass {
  const mobileUA = /iphone|android phone|windows phone/.test(hint);
  const tabletUA = /ipad|tablet|kindle|silk/.test(hint);

  if (tabletUA) return "tablet";
  if (mobileUA) return "mobile";
  if (pointer === "coarse" && touch) return width >= 900 ? "tablet" : "mobile";
  if (width < 760) return "mobile";
  if (width < 1120) return "tablet";
  return "desktop";
}

function createSnapshot(): DeviceSnapshot {
  if (typeof window === "undefined") {
    return {
      detected: "desktop",
      width: 1440,
      height: 900,
      orientation: "landscape",
      pointer: "fine",
      touch: false,
      userAgentHint: "Server render",
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pointer: "coarse" | "fine" = window.matchMedia?.("(pointer: coarse)").matches ? "coarse" : "fine";
  const touch = pointer === "coarse" || (navigator.maxTouchPoints ?? 0) > 0;
  const hint = userAgentHint(navigator.userAgent || "");

  return {
    detected: classify(width, pointer, hint, touch),
    width,
    height,
    orientation: width >= height ? "landscape" : "portrait",
    pointer,
    touch,
    userAgentHint: hint,
  };
}

function withEffective(snapshot: DeviceSnapshot, preview: PreviewMode): DeviceDisplayInfo {
  const effective = preview === "auto" ? snapshot.detected : preview;
  const layoutInfo = LAYOUT_BY_CLASS[effective];
  const detectedLayoutInfo = LAYOUT_BY_CLASS[snapshot.detected];
  return {
    ...snapshot,
    effective,
    detectedLabel: LABEL_BY_CLASS[snapshot.detected],
    effectiveLabel: LABEL_BY_CLASS[effective],
    detectedLayout: detectedLayoutInfo.layout,
    detectedLayoutLabel: detectedLayoutInfo.label,
    layout: layoutInfo.layout,
    layoutLabel: layoutInfo.label,
  };
}

export function useDeviceProfile() {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(createSnapshot);
  const [previewOverride, setPreviewOverrideState] = useState<PreviewMode>(readPreview);

  useEffect(() => {
    const update = () => setSnapshot(createSnapshot());
    const coarseQuery = window.matchMedia?.("(pointer: coarse)");

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    if (coarseQuery) {
      if (typeof coarseQuery.addEventListener === "function") {
        coarseQuery.addEventListener("change", update);
      } else {
        coarseQuery.addListener(update);
      }
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (coarseQuery) {
        if (typeof coarseQuery.removeEventListener === "function") {
          coarseQuery.removeEventListener("change", update);
        } else {
          coarseQuery.removeListener(update);
        }
      }
    };
  }, []);

  const setPreviewOverride = (mode: PreviewMode) => {
    setPreviewOverrideState(mode);
    try {
      window.localStorage.setItem(PREVIEW_KEY, mode);
    } catch {
      // Ignore storage failures; the preview still applies for this session.
    }
  };

  return {
    device: withEffective(snapshot, previewOverride),
    previewOverride,
    setPreviewOverride,
  };
}
