
import { STORAGE_KEY } from './config.js';
import { safeJsonParse } from './utils.js';

const EMPTY_STATE = {
  bookmarks: {},
  weak: {},
  lastSubject: null,
  lastQuestion: {},
  autoRead: false,
  speechLanguage: 'en-IN',
  speechVoice: '',
  speechVoiceLanguage: '',
  speechRate: 1,
  englishPracticeMode: false,
  theme: 'light',
  stats: {},
  visited: {}
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}

export function getStorageState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeJsonParse(raw, cloneDefaultState()) : cloneDefaultState();
    return {
      ...cloneDefaultState(),
      ...parsed,
      bookmarks: parsed && typeof parsed.bookmarks === 'object' ? parsed.bookmarks : {},
      weak: parsed && typeof parsed.weak === 'object' ? parsed.weak : {},
      lastQuestion: parsed && typeof parsed.lastQuestion === 'object' ? parsed.lastQuestion : {},
      stats: parsed && typeof parsed.stats === 'object' ? parsed.stats : {},
      visited: parsed && typeof parsed.visited === 'object' ? parsed.visited : {},
      autoRead: Boolean(parsed && parsed.autoRead),
      speechLanguage: parsed && parsed.speechLanguage === 'mr-IN' ? 'mr-IN' : 'en-IN',
      speechVoice: typeof parsed?.speechVoice === 'string' ? parsed.speechVoice : '',
      speechVoiceLanguage: parsed && ['en-IN', 'mr-IN'].includes(parsed.speechVoiceLanguage) ? parsed.speechVoiceLanguage : '',
      speechRate: [0.75, 1, 1.25].includes(Number(parsed && parsed.speechRate)) ? Number(parsed.speechRate) : 1,
      englishPracticeMode: Boolean(parsed && parsed.englishPracticeMode),
      theme: parsed && parsed.theme === 'dark' ? 'dark' : 'light'
    };
  } catch (error) {
    return cloneDefaultState();
  }
}

export function saveStorageState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Storage is unavailable:', error);
  }
}
