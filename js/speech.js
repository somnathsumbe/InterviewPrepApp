import { state } from './state.js';

let activeUtterance = null;
let playback = null;
let generation = 0;
let voicesChangedHandler = null;
const voiceSubscribers = new Set();

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
  const prefix = String(language || '').toLowerCase().split('-')[0];
  return getSpeechVoices().filter((voice) => voice.lang.toLowerCase().split('-')[0] === prefix);
}

export function subscribeToVoices(callback) {
  if (typeof callback !== 'function') return () => {};
  voiceSubscribers.add(callback);
  if (!voicesChangedHandler && canUseSpeech()) {
    voicesChangedHandler = () => voiceSubscribers.forEach((subscriber) => subscriber(getSpeechVoices()));
    window.speechSynthesis.addEventListener('voiceschanged', voicesChangedHandler);
  }
  return () => {
    voiceSubscribers.delete(callback);
    if (!voiceSubscribers.size && voicesChangedHandler && canUseSpeech()) {
      window.speechSynthesis.removeEventListener('voiceschanged', voicesChangedHandler);
      voicesChangedHandler = null;
    }
  };
}

function chooseVoice(language) {
  const matches = getVoicesForLanguage(language);
  if (language === 'mr-IN') return matches.find((voice) => /^mr-in$/i.test(voice.lang)) || matches[0] || null;
  return matches.find((voice) => /^en-in$/i.test(voice.lang))
    || matches.find((voice) => /^en-/i.test(voice.lang))
    || matches[0]
    || null;
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

  current.onItemStart?.(item, current.cursor, current.items.length);
  try {
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voice = chooseVoice(current.language);
    if (!voice) {
      playback = null;
      current.onError?.(current.language === 'mr-IN'
        ? 'No Marathi speech voice is available. Install a Marathi voice on your device to use Marathi playback.'
        : 'No English speech voice is available on this device.');
      return;
    }
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.rate = [0.75, 1, 1.25].includes(Number(state.storage.speechRate))
      ? Number(state.storage.speechRate)
      : current.rate;
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
    onEnd,
    onError
  };
  speakNext(token);
  return Boolean(playback);
}

export function stopSpeech() {
  generation += 1;
  playback = null;
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
