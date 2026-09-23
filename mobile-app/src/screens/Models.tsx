import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cpu, Trash2, Download, RefreshCw, Check } from 'lucide-react-native';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, isRTL, getCurrentLocale } from '../i18n';
import * as api from '../services/api';
import type { ModelInfo } from '../types';

export default function ModelsScreen() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const rtl = isRTL(getCurrentLocale());

  const load = useCallback(async () => {
    const r = await api.listModels();
    setModels(r.data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const pullModel = async (id: string) => {
    Alert.alert(t('models.pull'), `${t('models.pull')}: ${id}?`, [
      { text: t('common.cancel') },
      {
        text: t('common.confirm'),
        onPress: async () => {
          await api.pullModel(id);
          load();
        },
      },
    ]);
  };

  const removeModel = async (id: string) => {
    Alert.alert(t('models.delete'), `${t('models.delete')}: ${id}?`, [
      { text: t('common.cancel') },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await api.deleteModel(id);
          load();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ModelInfo }) => (
    <View style={styles.row}>
      <View style={styles.modelIcon}>
        <Cpu size={20} color={colors.dark.accent} />
      </View>
      <View style={styles.modelInfo}>
        <Text style={[styles.modelName, rtl && styles.textRtl]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.modelMeta}>{item.provider}{item.size ? ` · ${item.size}` : ''}</Text>
        <View style={styles.capRow}>
          {item.capabilities?.slice(0, 4).map((c) => (
            <View key={c} style={styles.cap}><Text style={styles.capText}>{c}</Text></View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        {item.loaded ? (
          <View style={styles.loadedBadge}><Check size={12} color={colors.dark.success} /><Text style={styles.loadedText}>{t('models.loaded')}</Text></View>
        ) : (
          <TouchableOpacity onPress={() => pullModel(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Download size={18} color={colors.dark.accent} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => removeModel(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Trash2 size={18} color={colors.dark.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('models.title')}</Text>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <RefreshCw size={20} color={colors.dark.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.dark.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={models}
          renderItem={renderItem}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.dark.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  loader: { flex: 1 },
  list: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  modelIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dark.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modelInfo: { flex: 1, marginLeft: spacing.md },
  modelName: { color: colors.dark.text, fontSize: typography.size.md, fontWeight: typography.weight.medium },
  modelMeta: { color: colors.dark.textMuted, fontSize: typography.size.xs, marginTop: 2 },
  capRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  cap: { backgroundColor: colors.dark.surfaceAlt, paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.xs },
  capText: { color: colors.dark.textSecondary, fontSize: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  loadedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34, 197, 94, 0.1)', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  loadedText: { color: colors.dark.success, fontSize: 10, fontWeight: typography.weight.medium },
  textRtl: { textAlign: 'right' },
});
