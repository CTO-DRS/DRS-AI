import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File as FileIcon, Upload, Trash2, Download } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, isRTL, getCurrentLocale } from '../i18n';
import * as api from '../services/api';
import type { FileItem } from '../types';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export default function FilesScreen() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const rtl = isRTL(getCurrentLocale());

  const load = useCallback(async () => {
    const r = await api.listFiles();
    setFiles(r.data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const pickAndUpload = async () => {
    try {
      setUploading(true);
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const r = await api.uploadFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
      if (r.data) {
        setFiles((prev) => [r.data!, ...prev]);
      } else {
        Alert.alert(t('common.error'), r.error || t('errors.server'));
      }
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (id: string) => {
    Alert.alert(t('files.delete'), t('files.delete') + '?', [
      { text: t('common.cancel') },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await api.deleteFile(id);
          setFiles((prev) => prev.filter((f) => f.id !== id));
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: FileItem }) => (
    <View style={styles.row}>
      <View style={styles.fileIcon}>
        <FileIcon size={20} color={colors.dark.accent} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, rtl && styles.textRtl]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>{formatBytes(item.size)} · {formatDate(item.uploadedAt)}</Text>
      </View>
      <TouchableOpacity onPress={() => removeFile(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Trash2 size={18} color={colors.dark.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('files.title')}</Text>
        <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUpload} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Upload size={18} color="#fff" />}
          <Text style={styles.uploadText}>{t('files.upload')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.dark.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={files}
          renderItem={renderItem}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <FileIcon size={48} color={colors.dark.textMuted} />
              <Text style={styles.emptyText}>{t('files.empty')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.dark.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.dark.accent, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, ...shadows.sm },
  uploadText: { color: '#fff', fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  list: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  fileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dark.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1, marginLeft: spacing.md },
  fileName: { color: colors.dark.text, fontSize: typography.size.md, fontWeight: typography.weight.medium },
  fileMeta: { color: colors.dark.textMuted, fontSize: typography.size.xs, marginTop: 2 },
  textRtl: { textAlign: 'right' },
  loader: { flex: 1 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.dark.textMuted, fontSize: typography.size.md },
});
