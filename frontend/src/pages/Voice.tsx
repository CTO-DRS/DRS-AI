import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Square as StopIcon, Volume2, Globe, History, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { voiceService } from '@/services/api';
import { useI18n } from '@/i18n';
import { toast } from 'sonner';

/**
 * Voice — real, keyless voice interaction (drSai voice-loop parity):
 *  1. Live ASR via the browser Web Speech API (SpeechRecognition) with
 *     interim results — Arabic, English, French, German.
 *  2. TTS via the browser speechSynthesis with a voice picker + rate.
 *  3. Optional server-side path: when the voice service has an
 *     STT/TTS provider configured, recordings fall back to the
 *     /voice/stt endpoint (see capabilities check).
 */

const SPEECH_LOCALES: Record<string, string> = {
  ar: 'ar-SA',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE'
};

interface HistoryEntry {
  text: string;
  kind: 'heard' | 'spoken';
  at: string;
}

/* Minimal typings for the vendor-prefixed Web Speech API. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function Voice() {
  const { t, lang } = useI18n();
  const [supported, setSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [finalText, setFinalText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [serverCaps, setServerCaps] = useState<{ serverStt: boolean; serverTts: boolean } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const finalRef = useRef('');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time capability probe; each setter owns its loading state */
    setSupported(getSpeechRecognition() !== null);
    voiceService
      .capabilities()
      .then((r) => setServerCaps({ serverStt: r.data?.data?.serverStt, serverTts: r.data?.data?.serverTts }))
      .catch(() => setServerCaps({ serverStt: false, serverTts: false }));
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const pushHistory = (text: string, kind: 'heard' | 'spoken') => {
    if (!text.trim()) return;
    setHistory((h) => [{ text, kind, at: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
  };

  /* ---------------- Server-side fallback (provider configured) --------------- */

  const serverTranscribe = async (blob: Blob) => {
    try {
      const response = await voiceService.transcribe(blob, SPEECH_LOCALES[lang]?.slice(0, 2));
      setFinalText(response.data.text);
      pushHistory(response.data.text, 'heard');
      toast.success(t('voice.done'));
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || t('voice.sttFailed');
      toast.error(msg);
    }
  };

  /* ---------------- Browser Web Speech (keyless default) --------------- */

  const startRecording = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      // Fallback: record audio and use the server STT if configured.
      navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((stream) => {
          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () => {
            stream.getTracks().forEach((tr) => tr.stop());
            serverTranscribe(new Blob(chunks, { type: 'audio/wav' }));
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
          setIsRecording(true);
          if (!serverCaps?.serverStt) {
            toast.error(t('voice.noSupport'));
          }
        })
        .catch(() => toast.error(t('voice.micDenied')));
      return;
    }

    const recognition = new Ctor();
    recognition.lang = SPEECH_LOCALES[lang] || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    finalRef.current = '';

    recognition.onresult = (event) => {
      let interimTxt = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${transcript}`.trim();
          pushHistory(transcript, 'heard');
        } else {
          interimTxt += transcript;
        }
      }
      setFinalText(finalRef.current);
      setInterim(interimTxt);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error(t('voice.micDenied'));
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast.error(`${t('voice.sttFailed')}: ${event.error}`);
      }
    };

    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
      setInterim('');
      setFinalText('');
    } catch {
      toast.error(t('voice.sttFailed'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setIsRecording(false);
  };

  /* ---------------- Text to speech --------------- */

  const speakText = (text?: string) => {
    const target = (text ?? finalText).trim();
    if (!target) return;

    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(target);
    utterance.lang = SPEECH_LOCALES[lang] || 'en-US';
    const voices = window.speechSynthesis?.getVoices() || [];
    const match = voices.find((v) => v.lang === utterance.lang) || voices.find((v) => v.lang.startsWith(lang));
    if (match) utterance.voice = match;
    utterance.rate = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    if (window.speechSynthesis) {
      window.speechSynthesis.speak(utterance);
      pushHistory(target, 'spoken');
    } else if (serverCaps?.serverTts) {
      voiceService
        .synthesize(target)
        .then((resp) => {
          const url = URL.createObjectURL(resp.data);
          new Audio(url).play();
          pushHistory(target, 'spoken');
        })
        .catch((error) => {
          const msg = error?.response?.data?.error?.message || t('voice.ttsFailed');
          toast.error(msg);
        });
    } else {
      toast.error(t('voice.noSupport'));
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('voice.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('voice.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recognition */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" /> {t('voice.recognition')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {t('voice.lang')}: <span className="font-medium">{SPEECH_LOCALES[lang]}</span>
              {serverCaps?.serverStt && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <Cpu className="h-3 w-3" /> {t('voice.serverStt')}
                </span>
              )}
            </div>

            <div className="min-h-[120px] rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
              {finalText || isRecording ? (
                <>
                  <span>{finalText}</span>
                  {interim && <span className="text-muted-foreground italic"> {interim}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">{t('voice.placeholder')}</span>
              )}
            </div>

            <div className="flex gap-2">
              {isRecording ? (
                <Button variant="destructive" onClick={stopRecording} className="flex items-center gap-2">
                  <Square className="h-4 w-4" /> {t('voice.stop')}
                </Button>
              ) : (
                <Button onClick={startRecording} className="flex items-center gap-2">
                  <Mic className="h-4 w-4" /> {t('voice.start')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setFinalText('');
                  setInterim('');
                }}
                disabled={isRecording || (!finalText && !interim)}
              >
                {t('voice.clear')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Synthesis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-4 w-4" /> {t('voice.synthesis')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full min-h-[120px] rounded-lg border bg-background p-3 text-sm"
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              placeholder={t('voice.ttsPlaceholder')}
            />
            <div className="flex gap-2">
              {isSpeaking ? (
                <Button variant="destructive" onClick={stopSpeaking} className="flex items-center gap-2">
                  <StopIcon className="h-4 w-4" /> {t('voice.stop')}
                </Button>
              ) : (
                <Button onClick={() => speakText()} className="flex items-center gap-2">
                  <Play className="h-4 w-4" /> {t('voice.speak')}
                </Button>
              )}
            </div>
            {!supported && (
              <p className="text-xs text-muted-foreground">{t('voice.noSupportHint')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> {t('voice.history')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('voice.historyEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className="text-xs font-medium text-muted-foreground mt-0.5 w-14 shrink-0">
                    {entry.kind === 'heard' ? t('voice.heard') : t('voice.spoken')}
                  </span>
                  <span className="text-sm flex-1">{entry.text}</span>
                  {entry.kind === 'heard' && (
                    <Button size="sm" variant="ghost" onClick={() => speakText(entry.text)}>
                      <Volume2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground mt-1">{entry.at}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
