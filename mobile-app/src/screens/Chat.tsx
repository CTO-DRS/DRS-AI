import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, Trash2, Sparkles } from 'lucide-react-native';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, isRTL, getCurrentLocale } from '../i18n';
import * as api from '../services/api';
import type { ChatMessage } from '../types';

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();
  const rtl = isRTL(getCurrentLocale());

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const pendingId = `a-${Date.now()}`;
    const pendingMsg: ChatMessage = {
      id: pendingId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput('');
    setSending(true);

    try {
      const r = await api.sendChatMessage(text, messages.filter((m) => !m.pending));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                pending: false,
                content: r.data?.message?.content || r.error || t('errors.server'),
                error: r.error ? r.error : undefined,
                model: r.data?.message?.model,
                confidence: r.data?.message?.confidence,
                sources: r.data?.message?.sources,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, t]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant, rtl && styles.msgRowRtl]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Sparkles size={16} color={colors.dark.accent} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {item.pending ? (
            <ActivityIndicator color={colors.dark.textSecondary} size="small" />
          ) : (
            <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>{item.content}</Text>
          )}
          {!isUser && !item.pending && item.confidence != null && (
            <Text style={styles.meta}>{t('chat.confidence')}: {(item.confidence * 100).toFixed(0)}%</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('chat.title')}</Text>
        {messages.length > 0 && (
          <TouchableOpacity onPress={() => setMessages([])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Trash2 size={20} color={colors.dark.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Sparkles size={48} color={colors.dark.accent} />
          <Text style={styles.emptyText}>{t('chat.empty')}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, rtl && styles.inputRtl]}
            value={input}
            onChangeText={setInput}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.dark.textMuted}
            multiline
            editable={!sending}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending || !input.trim()}>
            <Send size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.dark.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.dark.textSecondary, marginTop: spacing.md, fontSize: typography.size.md },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  msgRow: { flexDirection: 'row', marginBottom: spacing.md, gap: spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  msgRowRtl: { flexDirection: 'row-reverse' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.dark.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  bubble: { maxWidth: '78%', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg },
  bubbleUser: { backgroundColor: colors.dark.accent, borderBottomRightRadius: radius.xs },
  bubbleAssistant: { backgroundColor: colors.dark.surface, borderWidth: 1, borderColor: colors.dark.border, borderBottomLeftRadius: radius.xs },
  bubbleText: { fontSize: typography.size.md, lineHeight: typography.lineHeight.regular * typography.size.md },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAssistant: { color: colors.dark.text },
  meta: { color: colors.dark.textMuted, fontSize: typography.size.xs, marginTop: spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.dark.surface, borderTopWidth: 1, borderTopColor: colors.dark.border },
  input: { flex: 1, backgroundColor: colors.dark.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.dark.text, fontSize: typography.size.md, borderWidth: 1, borderColor: colors.dark.border, maxHeight: 120 },
  inputRtl: { textAlign: 'right' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.dark.accent, alignItems: 'center', justifyContent: 'center', ...shadows.glow },
});
