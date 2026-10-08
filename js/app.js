
import { FILTERS } from './config.js';
import { state, initializeTheme, saveAppState } from './state.js';
import { renderHome, renderPractice, renderSummary, renderSearchResults, showLoading, hideLoading, showError, hideError } from './ui.js';
import { showHomeView, showPracticeView, showSummaryView } from './router.js';
import { ensureSubjectData, getSubjectById, getCurrentQuestion, getVisibleQuestions, setCurrentQuestion, setCurrentSubjectAndResume, pickRandomQuestion } from './question-engine.js';
import { performSearch } from './search.js';
import { completeSubjectSession, getSubjectStats, isBookmarked, isWeak, toggleBookmark, toggleWeak } from './statistics.js';
import { canUseSpeech, speakQuestion, stopSpeech } from './speech.js';

function normalizeId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function setAutoRead(enabled) {
  state.storage.autoRead = Boolean(enabled);
  saveAppState();
  const autoToggle = document.getElementById('autoReadToggle');
  if (autoToggle) {
    autoToggle.textContent = `🔊 Auto Read: ${state.storage.autoRead ? 'ON' : 'OFF'}`;
    autoToggle.setAttribute('aria-pressed', String(state.storage.autoRead));
  }
  if (state.storage.autoRead) {
    const current = getCurrentQuestion();
    if (current) speakQuestion(current);
  } else {
    stopSpeech();
  }
}

async function openSubject(subjectId, resume = true) {
  try {
    showLoading('Loading questions...');
    const normalized = normalizeId(subjectId);
    await ensureSubjectData(normalized);
    const subject = state.subjectData[normalized];
    if (!subject || !subject.questions || !subject.questions.length) {
      throw new Error('Unable to load questions. Please try again.');
    }

    state.currentSubject = normalized;
    state.currentFilter = FILTERS.ALL;
    if (resume) {
      setCurrentSubjectAndResume(normalized, FILTERS.ALL);
    } else {
      setCurrentQuestion(normalized, subject.questions[0].id, FILTERS.ALL);
    }
    hideError();
    showPracticeView();
    renderPractice();
    if (state.storage.autoRead) {
      const current = getCurrentQuestion();
      if (current) speakQuestion(current);
    }
  } catch (error) {
    showError(error.message || 'Unable to load questions. Please try again.');
  } finally {
    hideLoading();
  }
}

function finishPractice() {
  stopSpeech();
  if (state.currentSubject) {
    completeSubjectSession(state.currentSubject);
  }
  renderSummary();
  showSummaryView();
}

function handleNext() {
  if (!state.currentSubject) return;
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  if (!questions.length) return;
  const currentIndex = questions.findIndex((question) => question.id === state.currentQuestionId);
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  if (nextIndex >= questions.length) {
    finishPractice();
    return;
  }
  const nextQuestion = questions[nextIndex];
  setCurrentQuestion(state.currentSubject, nextQuestion.id, state.currentFilter);
  renderPractice();
  if (state.storage.autoRead) speakQuestion(nextQuestion);
}

function handlePrevious() {
  if (!state.currentSubject) return;
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  if (!questions.length) return;
  const currentIndex = questions.findIndex((question) => question.id === state.currentQuestionId);
  if (currentIndex <= 0) return;
  const prevQuestion = questions[currentIndex - 1];
  setCurrentQuestion(state.currentSubject, prevQuestion.id, state.currentFilter);
  renderPractice();
  if (state.storage.autoRead) speakQuestion(prevQuestion);
}

function applyFilter(filter) {
  if (!state.currentSubject) return;
  state.currentFilter = filter;
  const questions = getVisibleQuestions(state.currentSubject, filter);
  if (!questions.length) {
    showError(filter === FILTERS.BOOKMARKS ? 'No bookmarked questions yet.' : filter === FILTERS.WEAK ? 'No weak questions yet.' : 'No questions available.');
    state.currentFilter = FILTERS.ALL;
    return;
  }
  const firstQuestion = questions[0];
  setCurrentQuestion(state.currentSubject, firstQuestion.id, filter);
  hideError();
  renderPractice();
  if (state.storage.autoRead) speakQuestion(firstQuestion);
}

document.addEventListener('click', async (event) => {
  const subjectButton = event.target.closest('[data-subject]');
  if (subjectButton && subjectButton.dataset.subject) {
    await openSubject(subjectButton.dataset.subject, true);
    return;
  }

  const resultButton = event.target.closest('.search-item');
  if (resultButton) {
    const subjectId = resultButton.dataset.subject || state.currentSubject;
    const questionId = resultButton.dataset.questionId;
    if (subjectId && questionId) {
      setCurrentQuestion(subjectId, questionId, state.currentFilter);
      document.getElementById('searchResults').classList.add('hidden');
      renderPractice();
      if (state.storage.autoRead) speakQuestion(getCurrentQuestion());
    }
    return;
  }

  const retryButton = event.target.closest('#retryButton');
  if (retryButton) {
    if (state.currentSubject) {
      await openSubject(state.currentSubject, true);
    } else if (state.subjectCatalog.length) {
      await openSubject(state.subjectCatalog[0].id, true);
    } else {
      showHomeView();
    }
    return;
  }

  if (event.target.closest('#themeButton')) {
    const nextTheme = state.storage.theme === 'dark' ? 'light' : 'dark';
    state.storage.theme = nextTheme;
    document.documentElement.setAttribute('data-theme', nextTheme);
    saveAppState();
    const toggle = document.getElementById('themeButton');
    if (toggle) toggle.textContent = nextTheme === 'dark' ? '☀️' : '🌙';
    return;
  }

  if (event.target.closest('#backToHome') || event.target.closest('#backToHomeBtn')) {
    stopSpeech();
    state.currentSubject = null;
    state.currentQuestionId = null;
    showHomeView();
    renderHome();
    return;
  }

  if (event.target.closest('#practiceAgainBtn')) {
    if (state.currentSubject) {
      openSubject(state.currentSubject, true);
    }
    return;
  }

  if (event.target.closest('#bookmarkBtn')) {
    if (!state.currentSubject || !state.currentQuestionId) return;
    toggleBookmark(state.currentSubject, state.currentQuestionId);
    renderPractice();
    return;
  }

  if (event.target.closest('#weakQuestionBtn')) {
    if (!state.currentSubject || !state.currentQuestionId) return;
    toggleWeak(state.currentSubject, state.currentQuestionId);
    renderPractice();
    return;
  }

  if (event.target.closest('#allQuestionsBtn')) {
    if (!state.currentSubject) return;
    state.currentFilter = FILTERS.ALL;
    const firstQuestion = getVisibleQuestions(state.currentSubject, FILTERS.ALL)[0];
    if (firstQuestion) {
      setCurrentQuestion(state.currentSubject, firstQuestion.id, FILTERS.ALL);
      renderPractice();
    }
    return;
  }

  if (event.target.closest('#bookmarksBtn')) {
    applyFilter(FILTERS.BOOKMARKS);
    return;
  }

  if (event.target.closest('#weakFilterBtn')) {
    applyFilter(FILTERS.WEAK);
    return;
  }

  if (event.target.closest('#randomBtn')) {
    if (!state.currentSubject) return;
    const question = pickRandomQuestion(state.currentSubject, state.currentFilter);
    if (question) {
      setCurrentQuestion(state.currentSubject, question.id, state.currentFilter);
      renderPractice();
      if (state.storage.autoRead) speakQuestion(question);
    }
    return;
  }

  if (event.target.closest('#readBtn')) {
    const current = getCurrentQuestion();
    if (!current) return;
    if (!canUseSpeech()) {
      showError('Text-to-Speech is not supported in this browser.');
      return;
    }
    hideError();
    speakQuestion(current);
    return;
  }

  if (event.target.closest('#stopBtn')) {
    stopSpeech();
    return;
  }

  if (event.target.closest('#prevBtn')) {
    handlePrevious();
    return;
  }

  if (event.target.closest('#nextBtn')) {
    handleNext();
    return;
  }

  if (event.target.closest('#autoReadToggle')) {
    setAutoRead(!state.storage.autoRead);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id !== 'searchInput' || !state.currentSubject) return;
  const term = event.target.value.trim();
  if (!term) {
    document.getElementById('searchResults').classList.add('hidden');
    return;
  }
  const results = performSearch(state.currentSubject, term);
  renderSearchResults(results);
});

document.addEventListener('keydown', (event) => {
  if (event.target.id === 'searchInput' && event.key === 'Escape') {
    event.target.value = '';
    document.getElementById('searchResults').classList.add('hidden');
  }
});

async function bootstrap() {
  initializeTheme();
  const backgroundButton = document.getElementById('themeButton');
  if (backgroundButton) backgroundButton.textContent = state.storage.theme === 'dark' ? '☀️' : '🌙';

  try {
    showLoading('Loading questions...');
    const catalog = await fetch('./data/subjects.json').then((response) => {
      if (!response.ok) throw new Error('Unable to load questions. Please try again.');
      return response.json();
    });
    state.subjectCatalog = Array.isArray(catalog) ? catalog : [];
    for (const subject of state.subjectCatalog) {
      await ensureSubjectData(subject.id);
    }
    renderHome();
    if (state.storage.lastSubject) {
      const target = getSubjectById(state.storage.lastSubject);
      if (target) {
        await openSubject(target.id, true);
      } else {
        showHomeView();
      }
    } else {
      showHomeView();
    }
  } catch (error) {
    showHomeView();
    showError(error.message || 'Unable to load questions. Please try again.');
  } finally {
    hideLoading();
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

bootstrap();
