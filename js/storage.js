
import { STORAGE_KEY } from './config.js';
import { safeJsonParse } from './utils.js';

const EMPTY_STATE = {
  bookmarks: {},
  weak: {},
  lastSubject: null,
  lastQuestion: {},
  autoRead: false,
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
