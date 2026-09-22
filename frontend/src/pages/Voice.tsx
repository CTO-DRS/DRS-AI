import { useState, useRef } from 'react';
import { Mic, Square, Play, Volume2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { voiceService } from '@/services/api';
import { toast } from 'sonner';

export default function Voice() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        try {
          const response = await voiceService.transcribe(audioBlob);
          setTranscript(response.data.text);
          toast.success('Transcription complete');
        } catch (error) {
          toast.error('Transcription failed');
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const speakText = async () => {
    if (!transcript) return;
    
    try {
      setIsPlaying(true);
      const response = await voiceService.synthesize(transcript);
      const audio = new Audio(URL.createObjectURL(response.data));
      audio.onended = () => setIsPlaying(false);
      audio.play();
    } catch (error) {
      toast.error('Speech synthesis failed');
      setIsPlaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice</h1>
        <p className="text-muted-foreground mt-2">
          Speech-to-text and text-to-speech capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Speech to Text */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              Speech to Text
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Button
                size="lg"
                variant={isRecording ? 'destructive' : 'default'}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-2" />
                    Start Recording
                  </>
                )}
              </Button>
            </div>

            {transcript && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{transcript}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Text to Speech */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Text to Speech
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full h-32 p-3 rounded-lg border bg-background resize-none"
              placeholder="Enter text to speak..."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={speakText}
              disabled={!transcript || isPlaying}
            >
              {isPlaying ? (
                <>
                  <Play className="w-4 h-4 mr-2 animate-pulse" />
                  Playing...
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 mr-2" />
                  Speak
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
