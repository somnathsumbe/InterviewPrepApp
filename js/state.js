
import { DEFAULT_THEME, FILTERS } from './config.js';
import { getStorageState, saveStorageState } from './storage.js';

export const state = {
  view: 'home',
  currentSubject: null,
  currentFilter: FILTERS.ALL,
  currentQuestionId: null,
  subjectCatalog: [],
  subjectData: {},
  loading: false,
  error: '',
  storage: getStorageState()
};

export function saveAppState() {
  saveStorageState(state.storage);
}

export function applyTheme(themeName = state.storage.theme || DEFAULT_THEME) {
  const theme = themeName === 'dark' ? 'dark' : 'light';
  state.storage.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveAppState();
  return theme;
}

export function initializeTheme() {
  applyTheme(state.storage.theme || DEFAULT_THEME);
}
