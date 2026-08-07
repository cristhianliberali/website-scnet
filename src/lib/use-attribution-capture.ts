import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { captureAttribution } from "./utm";

/**
 * Captures UTM/click-id params into localStorage + the 180-day cookie on
 * first load and on every client-side route change, so attribution survives
 * navigation to any future page without needing per-page wiring.
 */
export function useAttributionCapture() {
  const href = useLocation({ select: (location) => location.href });

  useEffect(() => {
    captureAttribution();
  }, [href]);
}
