import { state } from './state.js';

let activeUtterance = null;
let playback = null;
let generation = 0;
let voicesChangedHandler = null;
let voicesChangedPropertyHandler = null;
let voiceLoadTimer = null;
const voiceSubscribers = new Set();

function normalizeLanguageTag(language) {
  return String(language || '').toLowerCase().replace(/_/g, '-');
}

export function canUseSpeech() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && Boolean(window.speechSynthesis)
    && typeof window.SpeechSynthesisUtterance === 'function'
    && typeof window.speechSynthesis.speak === 'function';
}

export function getSpeechVoices() {
  if (!canUseSpeech() || typeof window.speechSynthesis.getVoices !== 'function') return [];
  return window.speechSynthesis.getVoices();
}

export function getVoicesForLanguage(language) {
  const requested = normalizeLanguageTag(language).split('-');
  const compatible = getSpeechVoices().filter((voice) => {
    const parts = normalizeLanguageTag(voice.lang).split('-');
    if (requested[0] === 'mr') return parts[0] === 'mr';
    return parts[0] === 'en';
  });
  return compatible.sort((first, second) => {
    const exact = normalizeLanguageTag(language);
    const firstLang = normalizeLanguageTag(first.lang);
    const secondLang = normalizeLanguageTag(second.lang);
    const firstIndian = firstLang === exact || firstLang.startsWith(`${exact}-`);
    const secondIndian = secondLang === exact || secondLang.startsWith(`${exact}-`);
    return Number(secondIndian) - Number(firstIndian);
  });
}

export function getPreferredVoice(language) {
  const voices = getVoicesForLanguage(language);
  if (normalizeLanguageTag(language).startsWith('mr')) {
    return voices.find((voice) => normalizeLanguageTag(voice.lang) === 'mr-in')
      || voices.find((voice) => normalizeLanguageTag(voice.lang).startsWith('mr-in-'))
      || voices[0]
      || null;
  }
  return voices.find((voice) => normalizeLanguageTag(voice.lang) === 'en-in')
    || voices.find((voice) => normalizeLanguageTag(voice.lang).startsWith('en-in-'))
    || voices[0]
    || null;
}

function onVoicesChanged() {
  const voices = getSpeechVoices();
  voiceSubscribers.forEach((subscriber) => subscriber(voices));
  if (!playback?.waitingForVoice) return;
  const voice = getPreferredVoice(playback.language);
  if (!voice) return;
  clearTimeout(voiceLoadTimer);
  voiceLoadTimer = null;
  playback.waitingForVoice = false;
  speakNext(playback.token);
}

export function subscribeToVoices(callback) {
  if (typeof callback !== 'function') return () => {};
  voiceSubscribers.add(callback);
  if (!voicesChangedHandler && canUseSpeech()) {
    voicesChangedHandler = onVoicesChanged;
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', voicesChangedHandler);
    } else {
      voicesChangedPropertyHandler = window.speechSynthesis.onvoiceschanged;
      window.speechSynthesis.onvoiceschanged = (event) => {
        voicesChangedPropertyHandler?.call(window.speechSynthesis, event);
        onVoicesChanged();
      };
    }
  }
  callback(getSpeechVoices());
  return () => {
    voiceSubscribers.delete(callback);
    if (!voiceSubscribers.size && voicesChangedHandler && canUseSpeech()) {
      if (typeof window.speechSynthesis.removeEventListener === 'function') {
        window.speechSynthesis.removeEventListener('voiceschanged', voicesChangedHandler);
      } else {
        window.speechSynthesis.onvoiceschanged = voicesChangedPropertyHandler || null;
        voicesChangedPropertyHandler = null;
      }
      voicesChangedHandler = null;
    }
  };
}

function chooseVoice(language) {
  return getPreferredVoice(language);
}

function makeQuestionText(question, language) {
  if (language === 'mr-IN') {
    const parts = question.speechMode === 'question'
      ? [question.questionMarathi]
      : question.speechMode === 'answer'
        ? [question.answerMarathi]
        : [question.questionMarathi, question.answerMarathi];
    return parts.map((part) => String(part || '').trim()).filter(Boolean).join('. ');
  }
  if (question.speechMode === 'question') return String(question.question || '').trim();
  if (question.speechMode === 'answer') return String(question.answer || '').trim();
  return [question.question, question.answer].map((part) => String(part || '').trim()).filter(Boolean).join('. ');
}

function finishPlayback(token) {
  if (!playback || playback.token !== token) return;
  const completed = playback;
  playback = null;
  activeUtterance = null;
  completed.onEnd?.();
}

function speakNext(token) {
  if (!playback || playback.token !== token) return;
  const current = playback;
  if (current.waitingForVoice) return;
  if (current.cursor >= current.items.length) {
    finishPlayback(token);
    return;
  }

  let item = null;
  let text = '';
  while (current.cursor < current.items.length && !text) {
    item = current.items[current.cursor];
    text = makeQuestionText(item, current.language);
    if (!text) current.cursor += 1;
  }
  if (!text) {
    current.cursor = current.items.length;
    finishPlayback(token);
    return;
  }

  const voice = chooseVoice(current.language);
  if (!voice) {
    current.waitingForVoice = true;
    current.onVoicePending?.(current.language);
    voiceLoadTimer = setTimeout(() => {
      if (!playback || playback.token !== token || !playback.waitingForVoice) return;
      playback = null;
      voiceLoadTimer = null;
      current.onError?.(current.language === 'mr-IN'
        ? 'No Marathi (mr-IN) speech voice is available. Install or enable a Marathi speech voice in your operating system or browser, then try again.'
        : 'No English speech voice is available. Install or enable an English speech voice in your operating system or browser, then try again.');
    }, 3000);
    return;
  }

  current.onItemStart?.(item, current.cursor, current.items.length);
  try {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.rate = [0.75, 1, 1.25].includes(Number(state.storage.speechRate))
      ? Number(state.storage.speechRate)
      : current.rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => {
      if (!playback || playback.token !== token || activeUtterance !== utterance) return;
      activeUtterance = null;
      playback.cursor += 1;
      speakNext(token);
    };
    utterance.onerror = (event) => {
      if (!playback || playback.token !== token || activeUtterance !== utterance) return;
      activeUtterance = null;
      playback = null;
      current.onError?.(event.error || 'Speech could not be completed.');
    };
    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    if (!playback || playback.token !== token) return;
    playback = null;
    activeUtterance = null;
    current.onError?.(error?.message || 'Speech could not be started.');
  }
}

export function startSpeechSequence(items, {
  language = state.storage.speechLanguage,
  rate = state.storage.speechRate,
  onItemStart = () => {},
  onVoicePending = () => {},
  onEnd = () => {},
  onError = () => {}
} = {}) {
  stopSpeech();
  if (!canUseSpeech()) {
    onError('Text-to-Speech is not supported in this browser.');
    return false;
  }
  if (!Array.isArray(items) || !items.length) {
    onError('There are no questions to read.');
    return false;
  }
  const token = ++generation;
  playback = {
    token,
    items: [...items],
    cursor: 0,
    language: language === 'mr-IN' ? 'mr-IN' : 'en-IN',
    rate: [0.75, 1, 1.25].includes(Number(rate)) ? Number(rate) : 1,
    onItemStart,
    onVoicePending,
    onEnd,
    onError
  };
  speakNext(token);
  return Boolean(playback);
}

export function stopSpeech() {
  generation += 1;
  playback = null;
  clearTimeout(voiceLoadTimer);
  voiceLoadTimer = null;
  if (activeUtterance) {
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  if (canUseSpeech()) window.speechSynthesis.cancel();
}

export function pauseSpeech() {
  if (!canUseSpeech() || !playback || !window.speechSynthesis.speaking || window.speechSynthesis.paused) return false;
  window.speechSynthesis.pause();
  return true;
}

export function resumeSpeech() {
  if (!canUseSpeech() || !playback || !window.speechSynthesis.paused) return false;
  window.speechSynthesis.resume();
  return true;
}

export function moveSpeech(offset) {
  if (!canUseSpeech() || !playback || !activeUtterance) return false;
  const nextCursor = playback.cursor + offset;
  if (nextCursor < 0 || nextCursor >= playback.items.length) return false;
  const token = playback.token;
  activeUtterance.onend = null;
  activeUtterance.onerror = null;
  activeUtterance = null;
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  playback.cursor = nextCursor;
  speakNext(token);
  return true;
}

export function isSpeechPlaying() {
  return Boolean(playback);
}
