// src/components/ui/QRCode.tsx
//
// Renders an invite link as a scannable QR code. The mobile app used
// react-native-qrcode-svg, which has no browser equivalent; `qrcode` is the
// standard Node/browser generator and produces a data URL we can put straight
// in an <img>.
//
// Generated asynchronously in an effect rather than at render: encoding is
// synchronous CPU work, and a list of invite cards would each block paint.

import { useEffect, useState } from "react";
import QRCodeLib from "qrcode";

export function QRCode({
  value,
  size = 96,
  alt,
}: {
  value: string;
  size?: number;
  /** Describe what the code encodes; QR content is meaningless read aloud. */
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCodeLib.toDataURL(value, {
      width: size * 2, // 2x so it stays sharp on retina displays
      margin: 1,
      // Fixed black-on-white regardless of theme: scanners rely on high
      // contrast, and a themed QR in dark mode reads far less reliably.
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "var(--radius-sm)",
          background: "var(--color-skeleton)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ borderRadius: "var(--radius-sm)", background: "#fff", padding: 2 }}
    />
  );
}
