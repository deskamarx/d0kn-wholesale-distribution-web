import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  SpeechRecognition as NativeSpeechRecognition,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionListeningEvent,
  type SpeechRecognitionPartialResultEvent,
  type SpeechRecognitionStartOptions,
} from "@capgo/capacitor-speech-recognition";
import { SpeechSynthesis as NativeSpeechSynthesis } from "@capgo/capacitor-speech-synthesis";
import type {
  SpeechRecognitionErrorLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from "./voice";

export function isNativeSpeechPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function syntheticEvent(text: string, isFinal: boolean): SpeechRecognitionEventLike {
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: {
        isFinal,
        0: { transcript: text, confidence: 1 },
      },
    },
  };
}

function nativeError(code: string): SpeechRecognitionErrorLike {
  const normalized = code.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("denied") || normalized.includes("not_allowed")) {
    return { error: "not-allowed", message: code };
  }
  if (normalized.includes("no_match") || normalized.includes("timeout") || normalized.includes("speech")) {
    return { error: "no-speech", message: code };
  }
  if (normalized.includes("network")) return { error: "network", message: code };
  return { error: "audio-capture", message: code };
}

function textFromPartial(event: SpeechRecognitionPartialResultEvent): string {
  const match = event.matches?.[0]?.trim() ?? "";
  const accumulated = event.accumulatedText?.trim() || event.accumulated?.trim() || "";
  if (!match) return accumulated;
  if (!accumulated || accumulated === match || accumulated.includes(match)) return accumulated || match;
  return `${accumulated} ${match}`.trim();
}

function nativePrompt(language: string): string {
  if (language.toLowerCase().startsWith("bn")) return "এখন বলুন";
  if (language.toLowerCase().startsWith("zh")) return "现在说话";
  return "Speak now";
}

async function resolveSpeechLanguage(language: string): Promise<string> {
  try {
    const { languages } = await NativeSpeechSynthesis.getLanguages();
    const requested = language.toLowerCase();
    if (languages.some((item) => item.toLowerCase() === requested)) return language;
    const prefix = requested.split("-")[0];
    const matching = languages.find((item) => {
      const value = item.toLowerCase();
      return value === prefix || value.startsWith(`${prefix}-`);
    });
    return matching ?? language;
  } catch {
    return language;
  }
}

class CapacitorSpeechRecognition implements SpeechRecognitionLike {
  lang = "en-US";
  continuous = false;
  interimResults = true;
  maxAlternatives = 1;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  private active = false;
  private latest = "";
  private listeners: PluginListenerHandle[] = [];
  private fallbackTimer: number | undefined;

  start(): void {
    void this.begin();
  }

  stop(): void {
    if (!this.active) return;
    void NativeSpeechRecognition.stop().catch(() => this.finish());
    this.scheduleFallback();
  }

  abort(): void {
    if (!this.active) return;
    void NativeSpeechRecognition.forceStop().catch(() => this.finish());
    this.scheduleFallback();
  }

  private async begin(): Promise<void> {
    try {
      const permission = await NativeSpeechRecognition.requestPermissions();
      if (permission.speechRecognition !== "granted" && permission.speechRecognition !== "prompt") {
        this.emitError({ error: "not-allowed" });
        return;
      }
      const { available } = await NativeSpeechRecognition.available();
      if (!available) {
        this.emitError({ error: "service-unavailable" });
        return;
      }

      await this.registerListeners();
      this.active = true;
      this.latest = "";
      this.onstart?.();

      const options: SpeechRecognitionStartOptions = {
        language: this.lang,
        maxResults: Math.max(1, this.maxAlternatives),
        partialResults: true,
        popup: false,
        prompt: nativePrompt(this.lang),
        muteRecognizerBeep: true,
        ...(this.continuous ? { keepListeningMs: 5000 } : {}),
      };
      await NativeSpeechRecognition.start(options);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      this.emitError(nativeError(code));
    }
  }

  private async registerListeners(): Promise<void> {
    await this.unregisterListeners();
    const [partial, state, error] = await Promise.all([
      NativeSpeechRecognition.addListener("partialResults", (event: SpeechRecognitionPartialResultEvent) => {
        const text = textFromPartial(event);
        if (!text) return;
        this.latest = text;
        if (this.interimResults) this.onresult?.(syntheticEvent(text, false));
      }),
      NativeSpeechRecognition.addListener("listeningState", (event: SpeechRecognitionListeningEvent) => {
        if (event.state === "started" || event.status === "started") {
          this.onstart?.();
        } else if (event.state === "stopped" || event.status === "stopped") {
          this.finish();
        }
      }),
      NativeSpeechRecognition.addListener("error", (event: SpeechRecognitionErrorEvent) => {
        this.emitError(nativeError(event.code || event.message || "unknown"));
      }),
    ]);
    this.listeners = [partial, state, error];
  }

  private async unregisterListeners(): Promise<void> {
    const listeners = this.listeners;
    this.listeners = [];
    await Promise.all(listeners.map((handle) => handle.remove().catch(() => undefined)));
  }

  private scheduleFallback(): void {
    if (this.fallbackTimer !== undefined) window.clearTimeout(this.fallbackTimer);
    this.fallbackTimer = window.setTimeout(() => this.finish(), 1400);
  }

  private emitError(error: SpeechRecognitionErrorLike): void {
    this.onerror?.(error);
    this.finish();
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    if (this.fallbackTimer !== undefined) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
    const text = this.latest.trim();
    if (text) this.onresult?.(syntheticEvent(text, true));
    void this.unregisterListeners();
    this.onend?.();
  }
}

export function createNativeSpeechRecognition(): new () => SpeechRecognitionLike {
  return CapacitorSpeechRecognition;
}

export async function speakWithNativeSpeech(text: string, language: string): Promise<void> {
  const speechLanguage = await resolveSpeechLanguage(language);
  await NativeSpeechSynthesis.cancel();
  return new Promise<void>((resolve, reject) => {
    let endHandle: PluginListenerHandle | undefined;
    let errorHandle: PluginListenerHandle | undefined;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      void Promise.all([
        endHandle?.remove().catch(() => undefined),
        errorHandle?.remove().catch(() => undefined),
      ]).then(() => (error ? reject(error) : resolve()));
    };

    void Promise.all([
      NativeSpeechSynthesis.addListener("end", () => finish()),
      NativeSpeechSynthesis.addListener("error", (event) => finish(new Error(event.error || "Speech synthesis failed"))),
    ])
      .then(async ([end, error]) => {
        endHandle = end;
        errorHandle = error;
        if (settled) return;
        try {
          await NativeSpeechSynthesis.speak({
            text,
            language: speechLanguage,
            rate: 0.98,
            pitch: 1,
            volume: 1,
            queueStrategy: "Flush",
          });
        } catch (speakError) {
          finish(speakError instanceof Error ? speakError : new Error(String(speakError)));
        }
      })
      .catch((listenerError) => finish(listenerError instanceof Error ? listenerError : new Error(String(listenerError))));
  });
}

export async function cancelNativeSpeech(): Promise<void> {
  try {
    await NativeSpeechSynthesis.cancel();
  } catch {
    // Ignore cancellation failures; the next utterance will flush the queue.
  }
}
