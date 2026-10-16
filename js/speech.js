
export function canUseSpeech() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && Boolean(window.speechSynthesis)
    && typeof window.SpeechSynthesisUtterance === 'function'
    && typeof window.speechSynthesis.speak === 'function';
}

let activeUtterance = null;

function getEnglishVoice() {
  const voices = typeof window.speechSynthesis.getVoices === 'function'
    ? window.speechSynthesis.getVoices()
    : [];
  return voices.find((voice) => /^en-in$/i.test(voice.lang))
    || voices.find((voice) => /^en-us$/i.test(voice.lang))
    || voices.find((voice) => /^en(?:-|$)/i.test(voice.lang))
    || null;
}

export function stopSpeech() {
  if (canUseSpeech()) {
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    window.speechSynthesis.cancel();
  }
}

export function pauseSpeech() {
  if (!canUseSpeech()) return false;
  try {
    window.speechSynthesis.pause();
    return true;
  } catch (error) {
    return false;
  }
}

export function resumeSpeech() {
  if (!canUseSpeech()) return false;
  try {
    window.speechSynthesis.resume();
    return true;
  } catch (error) {
    return false;
  }
}

export function speakEnglishText(englishText, { onEnd = () => {}, onError = () => {} } = {}) {
  stopSpeech();
  if (typeof englishText !== 'string' || !englishText.trim()) {
    onError('There is no English text available to read.');
    return false;
  }
  if (!canUseSpeech()) {
    onError('Text-to-Speech is not supported in this browser.');
    return false;
  }

  try {
    const utterance = new window.SpeechSynthesisUtterance(englishText.trim());
    const voice = getEnglishVoice();
    utterance.lang = voice ? voice.lang : 'en-US';
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      onEnd();
    };
    utterance.onerror = (event) => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      onError(event.error || 'Speech could not be completed.');
    };
    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    activeUtterance = null;
    onError(error?.message || 'Speech could not be started.');
    return false;
  }
}
