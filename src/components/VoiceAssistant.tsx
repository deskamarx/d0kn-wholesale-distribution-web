import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../types";
import { useLanguage } from "../i18n";
import NavIcon from "./NavIcon";
import {
  buildSummary,
  cancelSpeech,
  collectFields,
  detectCommand,
  getSpeechRecognition,
  hasSpeechSynthesis,
  localeFor,
  parseFieldCommand,
  resolveVoiceLanguage,
  setNativeValue,
  speakAloud,
  VOICE_LOCALES,
  type FieldTarget,
  type SpeechLanguage,
  type SpeechRecognitionLike,
  type VoiceLanguage,
} from "../lib/voice";

const VOICE_LANGUAGE_KEY = "d0kn-distribution-voice-language-v1";
const VOICE_FEEDBACK_KEY = "d0kn-distribution-voice-feedback-v1";

type Status = "idle" | "listening" | "processing" | "speaking" | "error";
type Mode = "auto" | "command" | "field";

interface ActiveField {
  element: FieldTarget["element"];
  label: string;
  rect: { top: number; left: number; bottom: number; right: number; height: number };
}

interface Props {
  state: AppState;
  tab: string;
  setTab: (tab: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

function readVoiceLanguage(): VoiceLanguage {
  try {
    const value = window.localStorage.getItem(VOICE_LANGUAGE_KEY);
    if (value === "auto" || value === "en" || value === "bn" || value === "zh") return value;
  } catch {
    // Ignore unavailable storage.
  }
  return "auto";
}

function readVoiceFeedback(): boolean {
  try {
    return window.localStorage.getItem(VOICE_FEEDBACK_KEY) !== "off";
  } catch {
    return true;
  }
}

function isControl(target: EventTarget | null): target is FieldTarget["element"] {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export default function VoiceAssistant({ state, tab, setTab, open, setOpen }: Props) {
  const { language, t } = useLanguage();
  const [voiceLanguage, setVoiceLanguageState] = useState<VoiceLanguage>(readVoiceLanguage);
  const [voiceFeedback, setVoiceFeedback] = useState<boolean>(readVoiceFeedback);
  const [mode, setMode] = useState<Mode>("auto");
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeField, setActiveField] = useState<ActiveField | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const listeningTargetRef = useRef<"command" | "field">("command");
  const targetFieldRef = useRef<FieldTarget | null>(null);
  const activeFieldRef = useRef<ActiveField | null>(null);
  const retryQueueRef = useRef<SpeechLanguage[]>([]);
  const retryIndexRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const launchRecognitionRef = useRef<(lang: SpeechLanguage) => void>(() => undefined);
  const tabRef = useRef(tab);
  const stateRef = useRef(state);
  const speechLangRef = useRef<SpeechLanguage>(language);

  const Recognition = getSpeechRecognition();
  const recognitionSupported = Boolean(Recognition);
  const synthesisSupported = hasSpeechSynthesis();

  useEffect(() => {
    tabRef.current = tab;
    stateRef.current = state;
  }, [tab, state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_LANGUAGE_KEY, voiceLanguage);
    } catch {
      // Ignore unavailable storage.
    }
  }, [voiceLanguage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_FEEDBACK_KEY, voiceFeedback ? "on" : "off");
    } catch {
      // Ignore unavailable storage.
    }
  }, [voiceFeedback]);

  const showFeedback = useCallback(
    (message: string, speak = false, lang?: SpeechLanguage) => {
      setFeedback(message);
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setFeedback(""), 5200);
      if (speak && voiceFeedback && synthesisSupported) {
        speechLangRef.current = lang ?? resolveVoiceLanguage(voiceLanguage, language);
        void speakAloud(message, VOICE_LOCALES[speechLangRef.current]).catch(() => undefined);
      }
    },
    [language, synthesisSupported, voiceFeedback, voiceLanguage]
  );

  const speakText = useCallback(
    async (text: string, lang: SpeechLanguage) => {
      if (!synthesisSupported) {
        showFeedback(t("Speech engine unavailable"));
        setStatus("idle");
        return;
      }
      speechLangRef.current = lang;
      setStatus("speaking");
      try {
        await speakAloud(text, VOICE_LOCALES[lang]);
      } catch {
        showFeedback(t("Speech engine unavailable"));
      } finally {
        setStatus("idle");
      }
    },
    [showFeedback, synthesisSupported, t]
  );

  const stopSpeaking = useCallback(() => {
    if (!synthesisSupported) return;
    void cancelSpeech();
    setStatus("idle");
    showFeedback(t("Speech stopped."));
  }, [showFeedback, synthesisSupported, t]);

  const runSummary = useCallback(
    (module: string = tabRef.current) => {
      const lang = resolveVoiceLanguage(voiceLanguage, language);
      const text = buildSummary(stateRef.current, module, lang);
      setTranscript(text);
      setOpen(true);
      showFeedback(t("Summary ready"));
      speakText(text, lang);
    },
    [language, setOpen, showFeedback, speakText, voiceLanguage]
  );

  useEffect(() => {
    const onSummaryRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ module?: string }>).detail;
      runSummary(detail?.module ?? tabRef.current);
    };
    window.addEventListener("d0kn-voice-summary", onSummaryRequest);
    return () => window.removeEventListener("d0kn-voice-summary", onSummaryRequest);
  }, [runSummary]);

  const processTranscript = useCallback(
    (text: string, speechLang: SpeechLanguage) => {
      setStatus("processing");
      const target = listeningTargetRef.current;
      const field = targetFieldRef.current;

      if (target === "field" && field) {
        const parsed = parseFieldCommand(text, speechLang, [field]);
        const value = parsed?.value ?? text.trim();
        setNativeValue(field.element, value);
        showFeedback(t("Wrote {value} to {field}", { value, field: field.label }), true, speechLang);
        setTranscript(value);
        setStatus("idle");
        return;
      }

      const command = detectCommand(text, speechLang);
      if (command.type === "stop") {
        stopSpeaking();
        setStatus("idle");
        return;
      }
      if (command.type === "help") {
        setOpen(true);
        showFeedback(
          `${t("Try: open products")} · ${t("Try: summarize dashboard")} · ${t("Try: name Nova X9 Pro")}`,
          true,
          speechLang
        );
        setStatus("idle");
        return;
      }
      if (command.type === "summary") {
        runSummary(command.tab ?? tabRef.current);
        return;
      }
      if (command.type === "navigate") {
        setTab(command.tab);
        showFeedback(t("Opened {module}", { module: t(NAV_KEYS_FOR_TAB[command.tab] ?? "Dashboard") }), true, speechLang);
        setStatus("idle");
        return;
      }
      if (command.type === "search") {
        setTab("search");
        window.dispatchEvent(new CustomEvent("d0kn-voice-search", { detail: { query: command.query } }));
        showFeedback(t("Searching for {text}", { text: command.query }), true, speechLang);
        setStatus("idle");
        return;
      }

      const fields = collectFields();
      const parsed = parseFieldCommand(command.text, speechLang, fields);
      if (parsed) {
        setNativeValue(parsed.field.element, parsed.value);
        showFeedback(t("Wrote {value} to {field}", { value: parsed.value, field: parsed.field.label }), true, speechLang);
        setTranscript(parsed.value);
      } else {
        setOpen(true);
        showFeedback(t("Command not recognized"), true, speechLang);
        setTranscript(command.text);
      }
      setStatus("idle");
    },
    [runSummary, setOpen, setTab, showFeedback, stopSpeaking, t]
  );

  const stopListening = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (status !== "speaking") setStatus("idle");
  }, [status]);

  const launchRecognition = useCallback(
    (lang: SpeechLanguage) => {
      if (!Recognition) return;
      const recognition = new Recognition();
      recognition.lang = VOICE_LOCALES[lang];
      recognition.continuous = listeningTargetRef.current === "field";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      speechLangRef.current = lang;

      recognition.onstart = () => setStatus("listening");
      recognition.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const piece = result?.[0]?.transcript ?? "";
          if (result?.isFinal) final += piece;
          else interim += piece;
        }
        if (final) finalTranscriptRef.current = `${finalTranscriptRef.current} ${final}`.trim();
        setTranscript(`${finalTranscriptRef.current} ${interim}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          showFeedback(t("Microphone permission was denied."));
          setStatus("error");
          retryIndexRef.current = retryQueueRef.current.length;
          return;
        }
        if (event.error === "service-unavailable") {
          showFeedback(t("Speech engine unavailable"));
          setStatus("error");
          retryIndexRef.current = retryQueueRef.current.length;
          return;
        }
        if (event.error === "no-speech") {
          showFeedback(t("No speech detected. Try again."));
        } else if (event.error !== "aborted") {
          showFeedback(t("Speech service error. Please try again."));
        }
        const nextIndex = retryIndexRef.current + 1;
        if (nextIndex < retryQueueRef.current.length && !finalTranscriptRef.current) {
          retryIndexRef.current = nextIndex;
          retryTimerRef.current = window.setTimeout(() => {
            launchRecognitionRef.current(retryQueueRef.current[nextIndex]);
          }, 350);
        }
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        const text = finalTranscriptRef.current.trim();
        if (text) {
          void processTranscript(text, lang);
        } else {
          setStatus("idle");
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        showFeedback(t("Speech service error. Please try again."));
        setStatus("error");
      }
    },
    [Recognition, processTranscript, showFeedback, t]
  );
  launchRecognitionRef.current = launchRecognition;

  const startListening = useCallback(
    (target: "command" | "field", field?: FieldTarget) => {
      if (!Recognition) {
        showFeedback(t("Speech recognition is not available in this browser."));
        setOpen(true);
        return;
      }
      if (recognitionRef.current) {
        stopListening();
        return;
      }
      const preferred = resolveVoiceLanguage(voiceLanguage, language);
      const alternatives = (["en", "bn", "zh"] as SpeechLanguage[]).filter((code) => code !== preferred);
      retryQueueRef.current = voiceLanguage === "auto" ? [preferred, ...alternatives] : [preferred];
      retryIndexRef.current = 0;
      finalTranscriptRef.current = "";
      listeningTargetRef.current = target;
      targetFieldRef.current = field ?? null;
      setTranscript("");
      setOpen(true);
      const lang = preferred;
      showFeedback(
        field
          ? t("Listening in {language}", { language: t(lang === "en" ? "English speech" : lang === "bn" ? "Bengali speech" : "Chinese speech") })
          : t("Listening in {language}", { language: t(lang === "en" ? "English speech" : lang === "bn" ? "Bengali speech" : "Chinese speech") })
      );
      launchRecognition(lang);
    },
    [Recognition, language, launchRecognition, setOpen, showFeedback, stopListening, t, voiceLanguage]
  );

  useEffect(() => {
    const updateRect = (element: FieldTarget["element"]) => {
      const rect = element.getBoundingClientRect();
      activeFieldRef.current = {
        element,
        label: activeFieldRef.current?.label ?? "",
        rect: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          height: rect.height,
        },
      };
      setActiveField(activeFieldRef.current);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!isControl(target) || !target.closest(".field")) return;
      const label =
        target.closest(".field")?.querySelector("label")?.textContent?.trim()
        ?? target.getAttribute("aria-label")
        ?? t("Voice input");
      activeFieldRef.current = {
        element: target,
        label,
        rect: { top: 0, left: 0, bottom: 0, right: 0, height: 0 },
      };
      updateRect(target);
    };

    let blurTimer: number | null = null;
    const onFocusOut = () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (listeningTargetRef.current === "field") return;
        activeFieldRef.current = null;
        setActiveField(null);
      }, 180);
    };

    const onViewportChange = () => {
      if (!activeFieldRef.current) return;
      updateRect(activeFieldRef.current.element);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      if (blurTimer !== null) window.clearTimeout(blurTimer);
    };
  }, [t]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
      if (synthesisSupported) void cancelSpeech();
    };
  }, [synthesisSupported]);

  const setVoiceLanguage = (value: VoiceLanguage) => {
    setVoiceLanguageState(value);
    showFeedback(t("Speech language"));
  };

  const effectiveField =
    mode === "field" || (mode === "auto" && activeField)
      ? activeField
      : null;
  const micTop =
    effectiveField && effectiveField.rect.bottom > window.innerHeight - 130
      ? Math.max(70, effectiveField.rect.top - 42)
      : Math.max(70, effectiveField?.rect.bottom ?? 0) + 6;
  const micLeft = effectiveField
    ? Math.min(Math.max(8, effectiveField.rect.right - 38), window.innerWidth - 48)
    : 0;

  const languageOptions: Array<{ value: VoiceLanguage; label: string }> = [
    { value: "auto", label: t("Auto-detect language") },
    { value: "en", label: t("English speech") },
    { value: "bn", label: t("Bengali speech") },
    { value: "zh", label: t("Chinese speech") },
  ];

  return (
    <>
      {effectiveField && !open && recognitionSupported && (
        <button
          type="button"
          className="voice-field-mic"
          style={{ top: micTop, left: micLeft }}
          title={t("Voice input")}
          aria-label={`${t("Voice input")}: ${effectiveField.label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => startListening("field", { element: effectiveField.element, label: effectiveField.label })}
        >
          <NavIcon name="mic" size={18} />
        </button>
      )}

      <button
        type="button"
        className={`voice-fab${status === "listening" ? " listening" : ""}${status === "speaking" ? " speaking" : ""}`}
        onClick={() => (status === "listening" ? stopListening() : setOpen(!open))}
        aria-label={t("Voice control")}
        title={t("Voice control")}
      >
        <NavIcon name={status === "listening" ? "stop" : "mic"} size={22} />
        {status === "listening" && <span className="voice-fab-pulse" />}
      </button>

      {feedback && (
        <div className="voice-toast" role="status">
          <NavIcon name="intelligence" size={16} />
          <span>{feedback}</span>
          <button type="button" className="ghost small" onClick={() => setFeedback("")} aria-label={t("Close")}>
            ×
          </button>
        </div>
      )}

      {open && (
        <div className="voice-panel-layer" role="dialog" aria-modal="false" aria-label={t("Voice control")}>
          <div className="voice-panel">
            <div className="voice-panel-header">
              <div>
                <strong>{t("Voice assistant")}</strong>
                <span>{t("Native-language dictation")}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label={t("Close voice panel")}>
                ×
              </button>
            </div>

            <div className="voice-mode-row" role="group" aria-label={t("Voice commands")}>
              {(["auto", "command", "field"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`voice-mode${mode === value ? " active" : ""}`}
                  onClick={() => setMode(value)}
                >
                  {value === "auto" ? t("Auto") : value === "command" ? t("Command mode") : t("Field mode")}
                </button>
              ))}
            </div>

            <label className="voice-language-field">
              <span>{t("Choose speech language")}</span>
              <select
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value as VoiceLanguage)}
                aria-label={t("Speech language")}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className={`voice-transcript${status === "listening" ? " active" : ""}`}>
              <span>{t("Live transcript")}</span>
              <p>{transcript || (status === "listening" ? t("Speak now") : t("Say a command or focus a field to dictate."))}</p>
            </div>

            <div className="voice-main-actions">
              <button
                type="button"
                className={`voice-mic-button${status === "listening" ? " listening" : ""}`}
                onClick={() => {
                  if (status === "listening") {
                    stopListening();
                    return;
                  }
                  const field = mode === "field" || (mode === "auto" && activeField) ? activeField : null;
                  startListening(field ? "field" : "command", field ? { element: field.element, label: field.label } : undefined);
                }}
                disabled={!recognitionSupported}
              >
                <NavIcon name={status === "listening" ? "stop" : "mic"} size={24} />
                <span>{status === "listening" ? t("Stop listening") : t("Start listening")}</span>
              </button>
              <button
                type="button"
                className="voice-secondary"
                onClick={() => runSummary()}
                disabled={!synthesisSupported}
                title={t("Speak the report")}
              >
                <NavIcon name="volume" size={20} />
                <span>{t("Speak summary")}</span>
              </button>
            </div>

            <div className="voice-panel-actions">
              <label className="voice-toggle">
                <input
                  type="checkbox"
                  checked={voiceFeedback}
                  onChange={(event) => setVoiceFeedback(event.target.checked)}
                />
                <span>{t("Enable voice feedback")}</span>
              </label>
              {status === "speaking" && (
                <button type="button" className="ghost small" onClick={stopSpeaking}>
                  {t("Stop speaking")}
                </button>
              )}
            </div>

            <div className="voice-tips">
              <strong>{t("Voice tip")}</strong>
              <span>{t("Say 'open dashboard', 'summarize this page', or a field name and value.")}</span>
              <div className="voice-example-chips">
                <button type="button" onClick={() => startListening("command")}>{t("Try: open products")}</button>
                <button type="button" onClick={() => runSummary()}>{t("Try: summarize dashboard")}</button>
                <button type="button" onClick={() => startListening("command")}>{t("Try: name Nova X9 Pro")}</button>
              </div>
            </div>

            <p className="voice-privacy">{t("Voice input is private and stays in this app.")}</p>
            {!recognitionSupported && (
              <p className="voice-warning">{t("Speech recognition is not available in this browser.")}</p>
            )}
            {recognitionSupported && voiceLanguage === "auto" && (
              <p className="voice-privacy">{t("Follow interface language")} · {localeFor(language)}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const NAV_KEYS_FOR_TAB: Record<string, string> = {
  dashboard: "Dashboard",
  intelligence: "Intelligence",
  analytics: "Analytics",
  suppliers: "Suppliers",
  products: "Products",
  imports: "Imports",
  shipments: "Shipments",
  warehouse: "Warehouse",
  customers: "Customers",
  quotations: "Quotations",
  orders: "Orders",
  invoices: "Invoices",
  payments: "Payments",
  compliance: "Compliance",
  search: "Search",
  settings: "Settings",
};
