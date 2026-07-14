/**
 * speech.js
 * ---------------------------------------------------------------------------
 * Thin wrapper around the browser's native Web Speech API.
 * - SpeechRecognition  -> voice IN  (speech-to-text)
 * - SpeechSynthesis    -> voice OUT (text-to-speech confirmations)
 *
 * Using the native browser API means zero cost, zero API keys, and it works
 * offline-capable on Chrome/Edge/Safari — a good fit for a demo/MVP. For
 * production-grade multilingual accuracy you'd swap this module for a cloud
 * STT service (Google Cloud Speech-to-Text, AWS Transcribe, Azure Speech).
 * Because everything else in the app talks to speech.js through the small
 * interface below, that swap wouldn't require touching app.js.
 * ---------------------------------------------------------------------------
 */

const SUPPORTED_LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "mr-IN", label: "मराठी" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ar-SA", label: "العربية" },
];

class SpeechController {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    this.lang = "en-US";
    this.listening = false;

    if (this.supported) {
      this.recognition = new SR();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = this.lang;

      this.recognition.onresult = (event) => this._handleResult(event);
      this.recognition.onerror = (event) => this._handleError(event);
      this.recognition.onend = () => {
        this.listening = false;
        if (this.onStateChange) this.onStateChange(false);
      };
    }

    this.onInterim = null; // (text) => void
    this.onFinal = null; // (text) => void
    this.onStateChange = null; // (isListening) => void
    this.onError = null; // (message) => void
  }

  setLanguage(code) {
    this.lang = code;
    if (this.recognition) this.recognition.lang = code;
  }

  start() {
    if (!this.supported) {
      this.onError && this.onError("Speech recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (this.listening) return;
    try {
      this.recognition.start();
      this.listening = true;
      this.onStateChange && this.onStateChange(true);
    } catch (err) {
      this.onError && this.onError("Couldn't start the microphone. " + err.message);
    }
  }

  stop() {
    if (this.recognition && this.listening) this.recognition.stop();
  }

  _handleResult(event) {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (interim && this.onInterim) this.onInterim(interim);
    if (final && this.onFinal) this.onFinal(final.trim());
  }

  _handleError(event) {
    const messages = {
      "no-speech": "Didn't catch that — no speech detected.",
      "audio-capture": "No microphone found. Check your device settings.",
      "not-allowed": "Microphone access was blocked. Allow it in your browser settings.",
      network: "Network error during speech recognition.",
    };
    this.onError && this.onError(messages[event.error] || `Speech error: ${event.error}`);
    this.listening = false;
    this.onStateChange && this.onStateChange(false);
  }

  /** Speak a short confirmation back to the user in the current language. */
  speak(text) {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = this.lang;
    utter.rate = 1.05;
    window.speechSynthesis.cancel(); // avoid overlapping confirmations
    window.speechSynthesis.speak(utter);
  }
}

window.AssistantSpeech = { SpeechController, SUPPORTED_LANGUAGES };
