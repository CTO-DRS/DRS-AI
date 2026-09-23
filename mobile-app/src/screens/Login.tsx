import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, isRTL, getCurrentLocale } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rtl = isRTL(getCurrentLocale());

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logo}>DRS AI</Text>
          <Text style={styles.tagline}>{t('app.tagline')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('auth.login')}</Text>

          <Text style={styles.label}>{t('auth.username')}</Text>
          <TextInput
            style={[styles.input, rtl && styles.inputRtl]}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="admin"
            placeholderTextColor={colors.dark.textMuted}
          />

          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            style={[styles.input, rtl && styles.inputRtl]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.dark.textMuted}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { color: colors.dark.accent, fontSize: typography.size.display, fontWeight: typography.weight.bold },
  tagline: { color: colors.dark.textSecondary, fontSize: typography.size.md, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  title: { color: colors.dark.text, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: spacing.lg },
  label: { color: colors.dark.textSecondary, fontSize: typography.size.sm, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.dark.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.dark.text,
    fontSize: typography.size.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  inputRtl: { textAlign: 'right' },
  error: { color: colors.dark.danger, marginTop: spacing.md, fontSize: typography.size.sm },
  button: {
    backgroundColor: colors.dark.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    ...shadows.glow,
  },
  buttonText: { color: '#fff', fontSize: typography.size.md, fontWeight: typography.weight.bold },
});
