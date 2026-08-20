// src/screens/DocumentCategoryScreen.tsx
//
// Files within a single document category. Upload is a mock placeholder —
// no real file storage, matches the pattern already established for
// receipt uploads (see submitExpense/ExpensesScreen) — the member just
// names a file, no real object storage/signed-URL flow yet
// (see docs/DEMO_MODE.md for the production gap).
//
// Integration:
//   - listDocuments, uploadDocument, deleteDocument → api/documents.ts
//   - usePermissions: can("documents.upload"/"documents.delete")
//   - Navigation: AppStackParamList → DocumentCategory { category, label }

import React, { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { usePermissions } from "../hooks/usePermissions";
import { listDocuments, uploadDocument, deleteDocument } from "../api/documents";
import type { ChapterDocument } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "DocumentCategory">;

function UploadModal({ visible, onClose, onUpload }: { visible: boolean; onClose: () => void; onUpload: (name: string, fileLabel: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleUpload() {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      // Demo mode has no real file picker/storage — the filename is
      // synthesized from the display name, same "honest placeholder"
      // pattern as expense receipts elsewhere in the app.
      const fileLabel = `${name.trim().toLowerCase().replace(/\s+/g, "_")}.pdf`;
      await onUpload(name.trim(), fileLabel);
      setName("");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not upload document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Upload Document</Text>
          <Pressable onPress={handleUpload} disabled={saving}>
            <Text style={[styles.modalDone, saving && { opacity: 0.4 }]}>{saving ? "Uploading…" : "Upload"}</Text>
          </Pressable>
        </View>
        <Text style={styles.fieldLabel}>Document Name</Text>
        <TextInput style={styles.field} value={name} onChangeText={setName} placeholder="e.g. Spring 2027 Bylaws" placeholderTextColor={colors.textMuted} />
        <Text style={styles.modalHint}>
          Demo mode doesn't upload a real file — this creates a placeholder entry so the flow can be evaluated end to end.
        </Text>
      </View>
    </Modal>
  );
}

export default function DocumentCategoryScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { category, label } = route.params;
  const { can } = usePermissions();
  const insets = useSafeAreaInsets();

  const [documents, setDocuments] = useState<ChapterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadVisible, setUploadVisible] = useState(false);

  const load = useCallback(async ({ silent }: { silent: boolean } = { silent: false }) => {
    if (!silent) setLoading(true);
    try {
      setDocuments(await listDocuments({ category }));
      navigation.setOptions({ title: label });
    } catch {
      Alert.alert("Error", "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, [category, label, navigation]);

  useFocusRefresh(load);

  function confirmDelete(doc: ChapterDocument) {
    Alert.alert("Delete Document", `Delete "${doc.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteDocument(doc.id); await load(); }
        catch (e: any) { Alert.alert("Error", e?.message ?? "Could not delete document"); }
      } },
    ]);
  }

  return (
    <>
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No documents in this category yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => Alert.alert(item.name, `${item.fileLabel}${item.sizeLabel ? ` · ${item.sizeLabel}` : ""}\n\nDownload isn't wired to real storage in this demo.`)}
              onLongPress={() => can("documents.delete") && confirmDelete(item)}
            >
              <Text style={styles.rowIcon}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.uploadedBy.firstName} {item.uploadedBy.lastName} · {new Date(item.uploadedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {can("documents.upload") && (
        <Pressable style={[styles.fab, { bottom: 24 + insets.bottom }]} onPress={() => setUploadVisible(true)}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <UploadModal
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        onUpload={async (name, fileLabel) => { await uploadDocument({ category, name, fileLabel }); await load(); }}
      />
    </>
  );
}

const styles = makeStyles((colors) => ({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 80 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, gap: 10 },
  rowIcon: { fontSize: 20 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  fab: {
    position: "absolute", bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  fabText: { fontSize: 28, color: colors.primaryText, lineHeight: 32 },

  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingTop: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalCancel: { color: colors.textMuted, fontSize: 16 },
  modalDone: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  modalHint: { fontSize: 12, color: colors.textMuted, marginTop: 12, lineHeight: 17 },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 6, marginTop: 16 },
  field: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 15 },
}));
