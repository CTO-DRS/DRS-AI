import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView, ScrollView } from 'react-native-safe-area-context';
import { Globe, Server, Brain, Volume2, Wifi, LogOut, Info } from 'lucide-react-native';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, supportedLocales, getCurrentLocale, setLocale } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import type { Locale } from '../types';

export default function SettingsScreen() {
  const { user, logout, setLanguage } = useAuth();
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [brainMode, setBrainMode] = useState<'left' | 'right' | 'auto'>('auto');
  const currentLocale = getCurrentLocale();

  useEffect(() => {
    (async () => {
      const ok = await api.pingServer();
      setConnected(ok);
    })();
  }, []);

  const changeLanguage = (locale: Locale) => {
    setLocale(locale);
    setLanguage(locale);
    Alert.alert(t('settings.language'), supportedLocales.find((l) => l.code === locale)?.name || locale);
  };

  const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );

  const Row = ({ label, value, right }: { label: string; value?: string; right?: React.ReactNode }) => (
    <View style={styles.row}>
      <View>
        <Text style={styles.rowLabel}>{label}</Text>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {right}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>

        {/* Connection status */}
        <Section title={t('settings.connectionStatus')} icon={<Wifi size={18} color={colors.dark.accent} />}>
          <Row
            label={connected === null ? t('common.loading') : connected ? t('settings.connected') : t('settings.disconnected')}
            value={serverUrl}
            right={<View style={[styles.statusDot, connected ? styles.statusOk : styles.statusBad]} />}
          />
        </Section>

        {/* Server */}
        <Section title={t('settings.server')} icon={<Server size={18} color={colors.dark.accent} />}>
          <Row label={t('settings.serverUrl')} value={serverUrl} />
        </Section>

        {/* Language */}
        <Section title={t('settings.language')} icon={<Globe size={18} color={colors.dark.accent} />}>
          {supportedLocales.map((l) => (
            <TouchableOpacity key={l.code} style={styles.localeRow} onPress={() => changeLanguage(l.code)}>
              <Text style={styles.localeFlag}>{l.flag}</Text>
              <Text style={styles.localeName}>{l.name}</Text>
              {currentLocale === l.code && <View style={styles.localeActive} />}
            </TouchableOpacity>
          ))}
        </Section>

        {/* Brain mode */}
        <Section title={t('settings.brainMode')} icon={<Brain size={18} color={colors.dark.accent} />}>
          {(['auto', 'left', 'right'] as const).map((mode) => (
            <TouchableOpacity key={mode} style={styles.brainRow} onPress={() => setBrainMode(mode)}>
              <Text style={styles.brainLabel}>
                {mode === 'auto' ? t('settings.autoBrain') : mode === 'left' ? t('settings.leftBrain') : t('settings.rightBrain')}
              </Text>
              {brainMode === mode && <View style={styles.localeActive} />}
            </TouchableOpacity>
          ))}
        </Section>

        {/* Voice */}
        <Section title={t('settings.voice')} icon={<Volume2 size={18} color={colors.dark.accent} />}>
          <Row label={t('settings.voiceId')} value="default" />
        </Section>

        {/* Appearance */}
        <Section title={t('settings.appearance')} icon={<Globe size={18} color={colors.dark.accent} />}>
          <Row label={t('settings.darkMode')} right={<Switch value={darkMode} onValueChange={setDarkMode} />} />
        </Section>

        {/* Notifications */}
        <Section title={t('settings.notifications')} icon={<Volume2 size={18} color={colors.dark.accent} />}>
          <Row label={t('settings.notifications')} right={<Switch value={notifications} onValueChange={setNotifications} />} />
        </Section>

        {/* About */}
        <Section title={t('settings.about')} icon={<Info size={18} color={colors.dark.accent} />}>
          <Row label={t('settings.version')} value="1.0.0" />
        </Section>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <LogOut size={18} color={colors.dark.danger} />
          <Text style={styles.logoutText}>{t('auth.logout')}</Text>
        </TouchableOpacity>

        {user && (
          <Text style={styles.userInfo}>
            {t('auth.welcome')}, {user.username}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerTitle: { color: colors.dark.text, fontSize: typography.size.xxl, fontWeight: typography.weight.bold, marginBottom: spacing.xl },
  section: { backgroundColor: colors.dark.surface, borderRadius: radius.lg, marginBottom: spacing.lg, ...shadows.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  sectionTitle: { color: colors.dark.text, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  sectionBody: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowLabel: { color: colors.dark.text, fontSize: typography.size.sm },
  rowValue: { color: colors.dark.textMuted, fontSize: typography.size.xs, marginTop: 2 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusOk: { backgroundColor: colors.dark.success },
  statusBad: { backgroundColor: colors.dark.danger },
  localeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  localeFlag: { fontSize: typography.size.lg },
  localeName: { flex: 1, color: colors.dark.text, fontSize: typography.size.sm },
  localeActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.dark.accent },
  brainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  brainLabel: { color: colors.dark.text, fontSize: typography.size.sm },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.dark.surface, borderRadius: radius.lg, paddingVertical: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  logoutText: { color: colors.dark.danger, fontSize: typography.size.md, fontWeight: typography.weight.medium },
  userInfo: { color: colors.dark.textMuted, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.md },
});
