// src/screens/DocumentsScreen.tsx
//
// Documents module (spec §8) — top-level view: one row per category
// (Constitution, Bylaws, Meeting Minutes, Recruitment, Forms, Officer
// Resources, Other) plus a "Useful Links" section for external resources
// (Pyli, CMT, chapter/national websites). Everyone with documents.view can
// browse; upload/delete happen inside DocumentCategoryScreen.
//
// Integration:
//   - listDocuments, listExternalLinks, createExternalLink, deleteExternalLink → api/documents.ts
//   - usePermissions: can("documents.upload") gates "+ Add Link"
//   - Navigation: AppStackParamList → Documents (no params), navigates to DocumentCategory

import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Modal, TextInput, Linking } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme/colors";
import { usePermissions } from "../hooks/usePermissions";
import { listDocuments, listExternalLinks, createExternalLink, deleteExternalLink } from "../api/documents";
import type { ChapterDocument, DocumentCategory, ExternalLink } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;

const CATEGORIES: { key: DocumentCategory; label: string; icon: string }[] = [
  { key: "CONSTITUTION", label: "Constitution", icon: "📜" },
  { key: "BYLAWS", label: "Bylaws", icon: "📘" },
  { key: "MEETING_MINUTES", label: "Meeting Minutes", icon: "🗒" },
  { key: "RECRUITMENT", label: "Recruitment", icon: "🎯" },
  { key: "FORMS", label: "Forms", icon: "📋" },
  { key: "OFFICER_RESOURCES", label: "Officer Resources", icon: "🗂" },
  { key: "OTHER", label: "Other", icon: "📎" },
];

function AddLinkModal({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (label: string, url: string) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!label.trim() || !url.trim()) { Alert.alert("Label and URL are required"); return; }
    setSaving(true);
    try {
      await onAdd(label.trim(), url.trim());
      setLabel(""); setUrl("");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>Add Link</Text>
          <Pressable onPress={handleSave} disabled={saving}>
            <Text style={[styles.modalDone, saving && { opacity: 0.4 }]}>{saving ? "Saving…" : "Add"}</Text>
          </Pressable>
        </View>
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput style={styles.field} value={label} onChangeText={setLabel} placeholder="e.g. Pyli" placeholderTextColor={colors.textMuted} />
        <Text style={styles.fieldLabel}>URL</Text>
        <TextInput style={styles.field} value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" placeholderTextColor={colors.textMuted} />
      </View>
    </Modal>
  );
}

export default function DocumentsScreen() {
  const navigation = useNavigation<NavProp>();
  const { can } = usePermissions();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [addLinkVisible, setAddLinkVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, extLinks] = await Promise.all([listDocuments({}), listExternalLinks()]);
      const byCategory: Record<string, number> = {};
      for (const d of docs as ChapterDocument[]) byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
      setCounts(byCategory);
      setLinks(extLinks);
    } catch {
      Alert.alert("Error", "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmRemoveLink(link: ExternalLink) {
    Alert.alert("Remove Link", `Remove "${link.label}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await deleteExternalLink(link.id); await load(); }
        catch (e: any) { Alert.alert("Error", e?.message ?? "Could not remove link"); }
      } },
    ]);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.group}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              style={styles.row}
              onPress={() => navigation.navigate("DocumentCategory", { category: c.key, label: c.label })}
            >
              <Text style={styles.rowIcon}>{c.icon}</Text>
              <Text style={styles.rowLabel}>{c.label}</Text>
              <Text style={styles.rowCount}>{counts[c.key] ?? 0}</Text>
              <Text style={styles.rowChevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Useful Links</Text>
          {can("documents.upload") && (
            <Pressable onPress={() => setAddLinkVisible(true)}>
              <Text style={styles.addText}>+ Add</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.group}>
          {links.length === 0 ? (
            <Text style={styles.emptyText}>No links yet</Text>
          ) : (
            links.map((link) => (
              <Pressable
                key={link.id}
                style={styles.row}
                onPress={() => Linking.openURL(link.url).catch(() => Alert.alert("Error", "Could not open link"))}
                onLongPress={() => can("documents.delete") && confirmRemoveLink(link)}
              >
                <Text style={styles.rowIcon}>🔗</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{link.label}</Text>
                  {link.category && <Text style={styles.linkMeta}>{link.category}</Text>}
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <AddLinkModal
        visible={addLinkVisible}
        onClose={() => setAddLinkVisible(false)}
        onAdd={async (label, url) => { await createExternalLink({ label, url }); await load(); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  group: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowCount: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  rowChevron: { fontSize: 18, color: colors.textMuted },
  linkMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyText: { color: colors.textMuted, textAlign: "center", padding: 20, fontSize: 14 },

  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingTop: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalCancel: { color: colors.textMuted, fontSize: 16 },
  modalDone: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 6, marginTop: 16 },
  field: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 15 },
});
