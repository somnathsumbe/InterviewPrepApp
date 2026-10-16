
import { FILTERS } from './config.js';
import { state, initializeTheme, saveAppState } from './state.js';
import { renderHome, renderPractice, renderSummary, renderSearchResults, showLoading, hideLoading, showError, hideError } from './ui.js';
import { showHomeView, showPracticeView, showSummaryView } from './router.js';
import { ensureSubjectData, getSubjectById, getCurrentQuestion, getVisibleQuestions, setCurrentQuestion, setCurrentSubjectAndResume, pickRandomQuestion } from './question-engine.js';
import { performSearch } from './search.js';
import { completeSubjectSession, getSubjectStats, isBookmarked, isWeak, toggleBookmark, toggleWeak } from './statistics.js';
import { canUseSpeech, speakEnglishText, stopSpeech, pauseSpeech, resumeSpeech } from './speech.js';

function normalizeId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

let autoReadSession = null;
let autoReadGeneration = 0;

function updateAutoReadControls(message = '') {
  const toggle = document.getElementById('autoReadToggle');
  const start = document.getElementById('startAutoReadBtn');
  const pause = document.getElementById('pauseAutoReadBtn');
  const resume = document.getElementById('resumeAutoReadBtn');
  const stop = document.getElementById('stopAutoReadBtn');
  const status = document.getElementById('autoReadStatus');
  const active = Boolean(autoReadSession);
  const paused = active && autoReadSession.paused;

  if (toggle) {
    toggle.textContent = `🔊 Auto Read Next: ${state.storage.autoRead ? 'ON' : 'OFF'}`;
    toggle.setAttribute('aria-pressed', String(state.storage.autoRead));
  }
  if (start) start.classList.toggle('hidden', active);
  if (pause) {
    pause.classList.toggle('hidden', !active || paused);
    pause.disabled = !active || paused;
  }
  if (resume) {
    resume.classList.toggle('hidden', !active || !paused);
    resume.disabled = !active || !paused;
  }
  if (stop) {
    stop.classList.toggle('hidden', !active);
    stop.disabled = !active;
  }
  if (status) {
    status.textContent = message || (paused
      ? 'Auto Read is paused.'
      : active ? 'Auto Read is reading this question sequence.' : '');
  }
}

function stopAutoRead({ cancelSpeech = true, message = '' } = {}) {
  autoReadGeneration += 1;
  autoReadSession = null;
  if (cancelSpeech) stopSpeech();
  updateAutoReadControls(message);
}

function advanceAutoRead(questionId, generation) {
  if (!autoReadSession
    || generation !== autoReadGeneration
    || state.currentSubject !== autoReadSession.subjectId
    || state.currentFilter !== autoReadSession.filter
    || state.currentQuestionId !== questionId) {
    stopAutoRead({ message: 'Auto Read stopped because the question sequence changed.' });
    return;
  }

  const visible = getVisibleQuestions(autoReadSession.subjectId, autoReadSession.filter);
  const currentPosition = autoReadSession.sequence.indexOf(questionId);
  const nextQuestion = autoReadSession.sequence
    .slice(currentPosition + 1)
    .map((id) => visible.find((entry) => entry.id === id))
    .find(Boolean);

  if (!nextQuestion) {
    stopAutoRead({ cancelSpeech: false });
    finishPractice();
    return;
  }

  setCurrentQuestion(autoReadSession.subjectId, nextQuestion.id, autoReadSession.filter);
  renderPractice();
  readAutoQuestion(nextQuestion, generation);
}

function readAutoQuestion(question, generation) {
  if (!autoReadSession || generation !== autoReadGeneration) return;
  const started = speakEnglishText(question.question, {
    onEnd: () => {
      if (!autoReadSession || generation !== autoReadGeneration) return;
      if (autoReadSession.paused) {
        autoReadSession.pendingAnswerId = question.id;
        return;
      }
      readAutoAnswer(question, generation);
    },
    onError: (message) => {
      if (generation !== autoReadGeneration) return;
      stopAutoRead({ cancelSpeech: false, message: `Auto Read stopped: ${message}` });
      showError(`Text-to-Speech could not continue: ${message}`);
    }
  });

  if (!started && autoReadSession && generation === autoReadGeneration) {
    stopAutoRead({ message: 'Auto Read could not start. Check that speech is available in this browser.' });
  }
}

function readAutoAnswer(question, generation) {
  if (!autoReadSession || generation !== autoReadGeneration) return;
  const started = speakEnglishText(question.answer, {
    onEnd: () => {
      if (!autoReadSession || generation !== autoReadGeneration) return;
      if (autoReadSession.paused) {
        autoReadSession.pendingQuestionId = question.id;
        return;
      }
      advanceAutoRead(question.id, generation);
    },
    onError: (message) => {
      if (generation !== autoReadGeneration) return;
      stopAutoRead({ cancelSpeech: false, message: `Auto Read stopped: ${message}` });
      showError(`Text-to-Speech could not continue: ${message}`);
    }
  });

  if (!started && autoReadSession && generation === autoReadGeneration) {
    stopAutoRead({ message: 'Auto Read could not start. Check that speech is available in this browser.' });
  }
}

function startAutoRead() {
  const current = getCurrentQuestion();
  if (!canUseSpeech()) {
    stopAutoRead({ message: 'Text-to-Speech is not supported in this browser.' });
    showError('Text-to-Speech is not supported in this browser.');
    return;
  }
  if (!current || !state.currentSubject) {
    stopAutoRead({ message: 'Open a question before starting Auto Read.' });
    return;
  }

  stopAutoRead();
  state.storage.autoRead = true;
  saveAppState();
  if (state.currentQuestionId !== current.id) {
    setCurrentQuestion(state.currentSubject, current.id, state.currentFilter);
    renderPractice();
  }
  const visible = getVisibleQuestions(state.currentSubject, state.currentFilter);
  const index = visible.findIndex((question) => question.id === current.id);
  if (index < 0) {
    updateAutoReadControls('Auto Read could not find the current question in this sequence.');
    return;
  }

  const generation = autoReadGeneration;
  autoReadSession = {
    subjectId: state.currentSubject,
    filter: state.currentFilter,
    sequence: visible.map((question) => question.id),
    paused: false
  };
  hideError();
  updateAutoReadControls();
  readAutoQuestion(current, generation);
}

function setAutoRead(enabled) {
  state.storage.autoRead = Boolean(enabled);
  saveAppState();
  if (!state.storage.autoRead && autoReadSession) stopAutoRead({ message: 'Auto Read is off.' });
  else updateAutoReadControls(state.storage.autoRead ? 'Auto Read is on. Start reading to continue through the sequence.' : 'Auto Read is off.');
}

async function openSubject(subjectId, resume = true) {
  stopAutoRead();
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
    updateAutoReadControls();
  } catch (error) {
    showError(error.message || 'Unable to load questions. Please try again.');
  } finally {
    hideLoading();
  }
}

function finishPractice() {
  stopAutoRead();
  stopSpeech();
  if (state.currentSubject) {
    completeSubjectSession(state.currentSubject);
  }
  renderSummary();
  showSummaryView();
}

function handleNext() {
  if (!state.currentSubject) return;
  const wasAutoReading = Boolean(autoReadSession);
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  if (!questions.length) return;
  const currentIndex = questions.findIndex((question) => question.id === state.currentQuestionId);
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  if (nextIndex >= questions.length) {
    finishPractice();
    return;
  }
  const nextQuestion = questions[nextIndex];
  if (wasAutoReading) stopAutoRead();
  else stopSpeech();
  setCurrentQuestion(state.currentSubject, nextQuestion.id, state.currentFilter);
  renderPractice();
  if (wasAutoReading) startAutoRead();
}

function handlePrevious() {
  if (!state.currentSubject) return;
  const wasAutoReading = Boolean(autoReadSession);
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  if (!questions.length) return;
  const currentIndex = questions.findIndex((question) => question.id === state.currentQuestionId);
  if (currentIndex <= 0) return;
  const prevQuestion = questions[currentIndex - 1];
  if (wasAutoReading) stopAutoRead();
  else stopSpeech();
  setCurrentQuestion(state.currentSubject, prevQuestion.id, state.currentFilter);
  renderPractice();
  if (wasAutoReading) startAutoRead();
}

function applyFilter(filter) {
  if (!state.currentSubject) return;
  stopAutoRead();
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
  updateAutoReadControls();
}

document.addEventListener('click', async (event) => {
  const subjectButton = event.target.closest('.tech-card[data-subject]');
  if (subjectButton && subjectButton.dataset.subject) {
    await openSubject(subjectButton.dataset.subject, true);
    return;
  }

  const resultButton = event.target.closest('.search-item');
  if (resultButton) {
    stopAutoRead();
    const subjectId = resultButton.dataset.subject || state.currentSubject;
    const questionId = resultButton.dataset.questionId;
    if (subjectId && questionId) {
      setCurrentQuestion(subjectId, questionId, state.currentFilter);
      document.getElementById('searchResults').classList.add('hidden');
      renderPractice();
      updateAutoReadControls();
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
    stopAutoRead();
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
    stopAutoRead();
    toggleBookmark(state.currentSubject, state.currentQuestionId);
    renderPractice();
    updateAutoReadControls();
    return;
  }

  if (event.target.closest('#weakQuestionBtn')) {
    if (!state.currentSubject || !state.currentQuestionId) return;
    stopAutoRead();
    toggleWeak(state.currentSubject, state.currentQuestionId);
    renderPractice();
    updateAutoReadControls();
    return;
  }

  if (event.target.closest('#allQuestionsBtn')) {
    if (!state.currentSubject) return;
    stopAutoRead();
    state.currentFilter = FILTERS.ALL;
    const firstQuestion = getVisibleQuestions(state.currentSubject, FILTERS.ALL)[0];
    if (firstQuestion) {
      setCurrentQuestion(state.currentSubject, firstQuestion.id, FILTERS.ALL);
      renderPractice();
      updateAutoReadControls();
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
    stopAutoRead();
    const question = pickRandomQuestion(state.currentSubject, state.currentFilter);
    if (question) {
      setCurrentQuestion(state.currentSubject, question.id, state.currentFilter);
      renderPractice();
      updateAutoReadControls();
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
    stopAutoRead();
    speakEnglishText(current.answer, {
      onError: (message) => showError(`Text-to-Speech could not read the English answer: ${message}`)
    });
    return;
  }

  if (event.target.closest('#questionReadBtn')) {
    const current = getCurrentQuestion();
    if (!current) return;
    stopAutoRead();
    hideError();
    speakEnglishText(current.question, {
      onError: (message) => showError(`Text-to-Speech could not read the English question: ${message}`)
    });
    return;
  }

  if (event.target.closest('#startAutoReadBtn')) {
    startAutoRead();
    return;
  }

  if (event.target.closest('#pauseAutoReadBtn')) {
    if (autoReadSession && pauseSpeech()) {
      autoReadSession.paused = true;
      updateAutoReadControls();
    } else if (autoReadSession) {
      stopAutoRead({ message: 'Speech could not be paused in this browser.' });
      showError('Speech could not be paused in this browser.');
    }
    return;
  }

  if (event.target.closest('#resumeAutoReadBtn')) {
    if (autoReadSession && resumeSpeech()) {
      const pendingQuestionId = autoReadSession.pendingQuestionId;
      const pendingAnswerId = autoReadSession.pendingAnswerId;
      autoReadSession.paused = false;
      autoReadSession.pendingQuestionId = null;
      autoReadSession.pendingAnswerId = null;
      updateAutoReadControls();
      if (pendingQuestionId) advanceAutoRead(pendingQuestionId, autoReadGeneration);
      else if (pendingAnswerId) {
        const question = getVisibleQuestions(autoReadSession.subjectId, autoReadSession.filter)
          .find((entry) => entry.id === pendingAnswerId);
        if (question) readAutoAnswer(question, autoReadGeneration);
      }
    } else if (autoReadSession) {
      stopAutoRead({ message: 'Speech could not be resumed in this browser.' });
      showError('Speech could not be resumed in this browser.');
    }
    return;
  }

  if (event.target.closest('#stopAutoReadBtn') || event.target.closest('#stopBtn')) {
    stopAutoRead({ message: 'Auto Read stopped.' });
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
  stopAutoRead();
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

window.addEventListener('pagehide', () => stopAutoRead());

async function bootstrap() {
  initializeTheme();
  const backgroundButton = document.getElementById('themeButton');
  if (backgroundButton) backgroundButton.textContent = state.storage.theme === 'dark' ? '☀️' : '🌙';
  updateAutoReadControls();

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
