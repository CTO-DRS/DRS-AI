import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, Square, Volume2 } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { colors, spacing, typography, radius, shadows } from '../theme';
import { t, isRTL, getCurrentLocale } from '../i18n';
import * as api from '../services/api';

export default function VoiceScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const insets = useSafeAreaInsets();
  const rtl = isRTL(getCurrentLocale());

  useEffect(() => {
    (async () => {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) console.warn('Mic permission denied');
      } catch (e) {
        console.warn('Mic permission error', e);
      }
    })();
    return () => {
      recording?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const startListening = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setListening(true);
      setTranscript('');
      setResponse('');
    } catch (err) {
      console.warn('Failed to start recording', err);
    }
  };

  const stopListening = async () => {
    if (!recording) return;
    setListening(false);
    setProcessing(true);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    try {
      // Submit to voice service (port 3006) for STT
      const r = await api.sendChatMessage(`[voice-attachment:${uri}]`, []);
      const text = r.data?.message?.content || '';
      setTranscript(text);
      setResponse(text);
    } catch (err) {
      setTranscript(t('errors.server'));
    } finally {
      setProcessing(false);
    }
  };

  const speak = (text: string) => {
    if (!text) return;
    setSpeaking(true);
    Speech.speak(text, {
      language: rtl ? 'ar-SA' : 'en-US',
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeaking(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('voice.title')}</Text>
      </View>

      <View style={styles.body}>
        <TouchableOpacity
          style={[styles.micButton, listening && styles.micButtonActive]}
          onPress={listening ? stopListening : startListening}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : listening ? (
            <Square size={48} color="#fff" fill="#fff" />
          ) : (
            <Mic size={48} color="#fff" />
          )}
        </TouchableOpacity>

        <Text style={styles.statusText}>
          {listening ? t('voice.listening') : processing ? t('voice.processing') : t('voice.tapToSpeak')}
        </Text>

        {(transcript || response) && (
          <View style={styles.transcriptCard}>
            <Text style={styles.transcriptLabel}>{t('voice.transcript')}</Text>
            <Text style={[styles.transcriptText, rtl && styles.textRtl]}>{transcript || response}</Text>
            <View style={styles.speakRow}>
              <TouchableOpacity style={styles.speakBtn} onPress={() => speak(response || transcript)}>
                <Volume2 size={18} color={colors.dark.accent} />
                <Text style={styles.speakText}>{speaking ? t('voice.stopSpeaking') : t('voice.speak')}</Text>
              </TouchableOpacity>
              {speaking && (
                <TouchableOpacity onPress={stopSpeaking}>
                  <Text style={styles.stopText}>{t('voice.stopSpeaking')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.dark.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  micButtonActive: { backgroundColor: colors.dark.danger, transform: [{ scale: 1.1 }] },
  statusText: { color: colors.dark.textSecondary, marginTop: spacing.xl, fontSize: typography.size.md },
  transcriptCard: { marginTop: spacing.xxl, width: '100%', backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadows.md },
  transcriptLabel: { color: colors.dark.textMuted, fontSize: typography.size.sm, marginBottom: spacing.xs },
  transcriptText: { color: colors.dark.text, fontSize: typography.size.md, lineHeight: typography.lineHeight.relaxed * typography.size.md },
  textRtl: { textAlign: 'right' },
  speakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  speakBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.dark.surfaceAlt, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  speakText: { color: colors.dark.accent, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  stopText: { color: colors.dark.danger, fontSize: typography.size.sm },
});
