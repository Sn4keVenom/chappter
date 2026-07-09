// src/screens/CheckInScreen.tsx
//
// Dual-mode screen controlled by route.params.mode:
//   "officer" — displays rotating HMAC-signed QR code; fetches token every 55s
//               (token valid 60s; buffer prevents race conditions)
//   "member"  — opens camera for QR scan; calls selfCheckIn on success
//
// Integration points:
//   · getCheckInToken() from api/attendance.ts
//   · selfCheckIn()     from api/attendance.ts
//   · react-native-qrcode-svg (officer mode)
//   · expo-camera CameraView with onBarcodeScanned (member mode)
//   · colors.ts
//   · AppStackParamList["CheckIn"] route params

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { useRoute, useNavigation } from "@react-navigation/native";
import { getCheckInToken, selfCheckIn, getEventRoster } from "../api/attendance";
import { colors } from "../theme/colors";

type CheckInMode = "officer" | "member";

export default function CheckInScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { eventId, mode } = route.params as { eventId: string; mode: CheckInMode };

  return mode === "officer" ? (
    <OfficerView eventId={eventId} />
  ) : (
    <MemberView eventId={eventId} />
  );
}

// ── Officer view: rotating QR ─────────────────────────────────────────────
function OfficerView({ eventId }: { eventId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [checkedIn, setCheckedIn] = useState(0);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      const result = await getCheckInToken(eventId);
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    } catch {
      // Leave previous token visible; will retry in 5s
    }
  }, [eventId]);

  const fetchCount = useCallback(async () => {
    try {
      const { checkedInCount } = await getEventRoster(eventId);
      setCheckedIn(checkedInCount);
    } catch {
      // Leave the previous count visible; will retry on the next tick
    }
  }, [eventId]);

  useEffect(() => {
    fetchToken();
    fetchCount();
    // Refresh token every 55s (token TTL is 60s)
    refreshRef.current = setInterval(fetchToken, 55_000);
    // Poll checked-in count every 10s so the officer sees new scans land
    // without needing to leave and reopen this screen.
    countRef.current = setInterval(fetchCount, 10_000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [fetchToken, fetchCount]);

  const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

  return (
    <View style={styles.screen}>
      <Text style={styles.modeLabel}>Show this QR to members</Text>
      {token ? (
        <View style={styles.qrContainer}>
          <QRCode
            value={token}
            size={260}
            color={colors.primary}
            backgroundColor={colors.surface}
          />
          <Text style={styles.expiryText}>Refreshes in {secondsLeft}s</Text>
        </View>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      )}
      <Text style={styles.checkedInCount}>{checkedIn} checked in</Text>
    </View>
  );
}

// ── Member view: camera scanner ───────────────────────────────────────────
function MemberView({ eventId }: { eventId: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<"success" | "already" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cooldown = useRef(false);

  const handleScan = useCallback(
    async (scan: BarcodeScanningResult) => {
      if (!scanning || cooldown.current) return;
      cooldown.current = true;
      setScanning(false);

      try {
        const res = await selfCheckIn(eventId, scan.data);
        setResult(res.alreadyCheckedIn ? "already" : "success");
      } catch (e: any) {
        setErrorMsg(e?.message ?? "Check-in failed — ask an officer to add you manually.");
        setResult("error");
        // Allow retry after 3 seconds
        setTimeout(() => {
          setResult(null);
          setScanning(true);
          cooldown.current = false;
        }, 3000);
        return;
      }
      cooldown.current = false;
    },
    [scanning, eventId]
  );

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Camera access is required to scan the check-in code.</Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant access</Text>
        </Pressable>
      </View>
    );
  }

  if (result === "success") {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successText}>Checked in!</Text>
        <Text style={styles.successSub}>Points will appear shortly.</Text>
      </View>
    );
  }

  if (result === "already") {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successText}>Already checked in</Text>
        <Text style={styles.successSub}>You're on the list.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanning ? handleScan : undefined}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      >
        {/* Scan frame overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Point at the officer's QR code</Text>
          {result === "error" && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMsg}</Text>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_BORDER = 4;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modeLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textAlign: "center", marginTop: 24, textTransform: "uppercase", letterSpacing: 0.5 },
  qrContainer: { alignItems: "center", marginTop: 32, padding: 24, backgroundColor: colors.surface, borderRadius: 20, marginHorizontal: 32, borderWidth: 1, borderColor: colors.border },
  expiryText: { marginTop: 16, fontSize: 13, color: colors.textMuted },
  checkedInCount: { marginTop: 24, fontSize: 18, fontWeight: "700", color: colors.primary, textAlign: "center" },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  scanFrame: {
    width: 240, height: 240,
    borderRadius: 8,
    position: "relative",
  },
  corner: {
    position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE,
    borderColor: colors.accent, borderWidth: CORNER_BORDER,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  scanHint: { color: "#fff", marginTop: 28, fontSize: 14, fontWeight: "600" },
  errorBanner: { marginTop: 16, backgroundColor: colors.danger, borderRadius: 8, padding: 12, maxWidth: 280 },
  errorBannerText: { color: "#fff", fontSize: 13, textAlign: "center" },
  successIcon: { fontSize: 64, color: colors.success },
  successText: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  successSub: { fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  permText: { fontSize: 15, color: colors.textPrimary, textAlign: "center", marginBottom: 16 },
  permButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  permButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
