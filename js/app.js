import { FILTERS } from './config.js';
import { state, initializeTheme, saveAppState } from './state.js';
import { renderHome, renderPractice, renderSummary, renderSearchResults, showLoading, hideLoading, showError, hideError } from './ui.js';
import { showHomeView, showPracticeView, showSummaryView } from './router.js';
import { ensureSubjectData, getSubjectById, getCurrentQuestion, getVisibleQuestions, setCurrentQuestion, setCurrentSubjectAndResume, pickRandomQuestion } from './question-engine.js';
import { performSearch } from './search.js';
import { completeSubjectSession, getSubjectStats, toggleBookmark, toggleWeak } from './statistics.js';
import { canUseSpeech, getSpeechVoices, getPreferredVoice, subscribeToVoices, startSpeechSequence, stopSpeech, pauseSpeech, resumeSpeech, moveSpeech, isSpeechPlaying } from './speech.js';

let playbackSession = null;
let playbackPaused = false;
let speechWaitingForVoice = false;
let unsubscribeVoices = null;

function updatePlaybackControls(message = '') {
  const active = isSpeechPlaying();
  const pause = document.getElementById('pauseSpeechBtn');
  const resume = document.getElementById('resumeSpeechBtn');
  const stop = document.getElementById('stopSpeechBtn');
  if (pause) pause.disabled = !active || playbackPaused || speechWaitingForVoice;
  if (resume) resume.disabled = !active || !playbackPaused;
  if (stop) stop.disabled = !active;
  const status = document.getElementById('speechStatus');
  if (status && message) status.textContent = message;
}

function stopPlayback(message = '') {
  playbackSession = null;
  playbackPaused = false;
  speechWaitingForVoice = false;
  stopSpeech();
  updatePlaybackControls(message);
}

function updateVoiceStatus() {
  const status = document.getElementById('voiceStatus');
  if (!status) return;
  if (!canUseSpeech()) {
    status.textContent = 'Text-to-Speech is not supported in this browser.';
    return;
  }

  const language = state.storage.englishPracticeMode ? 'en-IN' : state.storage.speechLanguage;
  const voices = getSpeechVoices();
  const englishVoice = getPreferredVoice('en-IN');
  const marathiVoice = getPreferredVoice('mr-IN');
  const preferred = language === 'mr-IN' ? marathiVoice : englishVoice;
  const isIndianEnglish = englishVoice
    && /^en[-_]in(?:$|[-_])/i.test(englishVoice.lang);
  const availableStatus = voices.length
    ? `English (India) en-IN: ${isIndianEnglish ? `available (${englishVoice.name})` : 'unavailable'}${englishVoice && !isIndianEnglish ? `; English fallback available (${englishVoice.name}, ${englishVoice.lang})` : ''}. Marathi mr-IN: ${marathiVoice ? `available (${marathiVoice.name}, ${marathiVoice.lang})` : 'unavailable'}.`
    : 'Waiting for speech voices from the browser.';
  const selectedStatus = preferred
    ? language === 'mr-IN'
      ? `Marathi voice selected: ${preferred.name} (${preferred.lang}).`
      : isIndianEnglish
        ? `Indian English voice selected: ${preferred.name} (${preferred.lang}).`
        : `Indian English is not installed. Using the available English voice ${preferred.name} (${preferred.lang}); install an en-IN voice for Indian pronunciation.`
    : language === 'mr-IN'
      ? 'Marathi speech is unavailable. Install or enable a Marathi speech voice in your operating system or browser; English will not be used for Marathi.'
      : 'No English speech voice is available. Install or enable a voice in your operating system or browser.';
  status.textContent = `${availableStatus} ${selectedStatus}`;
  if (state.storage.englishPracticeMode) status.textContent = `English Practice Mode forces English speech. ${status.textContent}`;
}

function setSpeechPanelExpanded(expanded) {
  const toggle = document.getElementById('speechPanelToggle');
  const content = document.getElementById('speechPanelContent');
  const chevron = document.getElementById('speechPanelChevron');
  if (!toggle || !content || !chevron) return;
  toggle.setAttribute('aria-expanded', String(expanded));
  content.classList.toggle('hidden', !expanded);
  chevron.textContent = expanded ? '⌃' : '⌄';
}

function updateAutoReadToggle() {
  const button = document.getElementById('autoReadToggle');
  if (!button) return;
  button.textContent = `Auto Read Next: ${state.storage.autoRead ? 'ON' : 'OFF'}`;
  button.setAttribute('aria-pressed', String(state.storage.autoRead));
}

function openPracticeAt(question) {
  if (!question || !state.currentSubject) return;
  setCurrentQuestion(state.currentSubject, question.id, state.currentFilter);
  renderPractice();
}

function startSequence(questions, { label = 'Reading questions', contentMode = 'all' } = {}) {
  if (!state.currentSubject) return;
  stopPlayback();
  if (!canUseSpeech()) {
    showError('Text-to-Speech is not supported in this browser.');
    return;
  }
  if (!questions.length) {
    showError('There are no questions in the selected sequence.');
    return;
  }

  hideError();
  const subjectId = state.currentSubject;
  const sequence = questions.map((question) => ({ ...question, speechMode: contentMode }));
  const session = { subjectId, questions: sequence };
  playbackSession = session;
  playbackPaused = false;
  updatePlaybackControls(`${label}...`);
  const started = startSpeechSequence(sequence, {
    language: state.storage.englishPracticeMode ? 'en-IN' : state.storage.speechLanguage,
    rate: state.storage.speechRate,
    onVoicePending: (language) => {
      speechWaitingForVoice = true;
      const status = document.getElementById('voiceStatus');
      if (status) status.textContent = `Waiting for an available ${language === 'mr-IN' ? 'Marathi' : 'Indian English'} voice...`;
      updatePlaybackControls();
    },
    onItemStart: (question) => {
      if (playbackSession !== session || state.currentSubject !== subjectId) return;
      speechWaitingForVoice = false;
      state.currentFilter = FILTERS.ALL;
      openPracticeAt(question);
      const all = getVisibleQuestions(subjectId, FILTERS.ALL);
      const index = all.findIndex((entry) => entry.id === question.id);
      const status = document.getElementById('speechStatus');
      if (status) status.textContent = `Reading question ${index + 1} of ${all.length}`;
      updatePlaybackControls();
    },
    onEnd: () => {
      if (playbackSession !== session) return;
      playbackSession = null;
      playbackPaused = false;
      speechWaitingForVoice = false;
      updatePlaybackControls('Reading complete.');
    },
    onError: (message) => {
      if (playbackSession !== session) return;
      playbackSession = null;
      playbackPaused = false;
      speechWaitingForVoice = false;
      updatePlaybackControls(`Speech stopped: ${message}`);
      updateVoiceStatus();
      showError(`Text-to-Speech could not continue: ${message}`);
    }
  });
  if (!started && playbackSession === session) {
    playbackSession = null;
    updatePlaybackControls();
  }
}

function getBankQuestions() {
  return state.currentSubject ? getVisibleQuestions(state.currentSubject, FILTERS.ALL) : [];
}

function currentBankIndex(questions = getBankQuestions()) {
  const index = questions.findIndex((question) => question.id === state.currentQuestionId);
  return index >= 0 ? index : 0;
}

function readCurrent() {
  const current = getCurrentQuestion();
  if (current) startSequence([current], { label: 'Reading current question' });
}

function readFromHere() {
  const questions = getBankQuestions();
  if (questions.length) startSequence(questions.slice(currentBankIndex(questions)), { label: 'Reading from current question' });
}

function readAll() {
  const questions = getBankQuestions();
  if (questions.length) startSequence(questions, { label: 'Reading all questions' });
}

function readRange() {
  const questions = getBankQuestions();
  const end = Number(document.getElementById('rangeEnd').value);
  const start = currentBankIndex(questions) + 1;
  const validation = document.getElementById('rangeValidation');
  let error = '';
  if (!Number.isInteger(end)) error = 'Enter a whole number for the end question.';
  else if (end < 1 || end > questions.length) error = `Choose an end question from 1 to ${questions.length}.`;
  else if (end < start) error = `End question must be question ${start} or later, the current question.`;

  if (validation) {
    validation.textContent = error;
    validation.classList.toggle('hidden', !error);
  }
  if (error) return;
  startSequence(questions.slice(start - 1, end), { label: `Reading questions ${start} to ${end}` });
}

async function openSubject(subjectId, resume = true) {
  stopPlayback();
  try {
    showLoading('Loading questions...');
    const subject = getSubjectById(subjectId);
    if (!subject) throw new Error('That technology is not in the subject catalog.');
    await ensureSubjectData(subject.id);
    const data = state.subjectData[subject.id];
    if (!data?.questions?.length) throw new Error(`${subject.name} does not have any available questions.`);

    state.currentSubject = subject.id;
    state.currentFilter = FILTERS.ALL;
    if (resume) setCurrentSubjectAndResume(subject.id, FILTERS.ALL);
    else setCurrentQuestion(subject.id, data.questions[0].id, FILTERS.ALL);
    hideError();
    showPracticeView();
    setSpeechPanelExpanded(false);
    renderPractice();
    updateVoiceStatus();
    updateAutoReadToggle();
  } catch (error) {
    showHomeView();
    showError(error.message || 'Unable to load this question bank. Please try again.');
  } finally {
    hideLoading();
  }
}

function finishPractice() {
  stopPlayback();
  if (state.currentSubject) completeSubjectSession(state.currentSubject);
  renderSummary();
  showSummaryView();
}

function handleNext() {
  if (!state.currentSubject) return;
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  const index = questions.findIndex((question) => question.id === state.currentQuestionId);
  if (index < 0 || index + 1 >= questions.length) {
    finishPractice();
    return;
  }
  stopPlayback();
  openPracticeAt(questions[index + 1]);
  if (state.storage.autoRead) readFromHere();
}

function handlePrevious() {
  if (!state.currentSubject) return;
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  const index = questions.findIndex((question) => question.id === state.currentQuestionId);
  if (index <= 0) return;
  stopPlayback();
  openPracticeAt(questions[index - 1]);
  if (state.storage.autoRead) readFromHere();
}

function applyFilter(filter) {
  if (!state.currentSubject) return;
  stopPlayback();
  const questions = getVisibleQuestions(state.currentSubject, filter);
  if (!questions.length) {
    showError(filter === FILTERS.BOOKMARKS ? 'No bookmarked questions yet.' : filter === FILTERS.WEAK ? 'No weak questions yet.' : 'No questions available.');
    return;
  }
  state.currentFilter = filter;
  setCurrentQuestion(state.currentSubject, questions[0].id, filter);
  hideError();
  renderPractice();
}

document.addEventListener('click', async (event) => {
  const subjectButton = event.target.closest('.tech-card[data-subject]');
  if (subjectButton?.dataset.subject) {
    await openSubject(subjectButton.dataset.subject, true);
    return;
  }

  const resultButton = event.target.closest('.search-item');
  if (resultButton) {
    stopPlayback();
    const questionId = resultButton.dataset.questionId;
    if (questionId && state.currentSubject) {
      state.currentFilter = FILTERS.ALL;
      setCurrentQuestion(state.currentSubject, questionId, FILTERS.ALL);
      document.getElementById('searchResults').classList.add('hidden');
      renderPractice();
    }
    return;
  }

  if (event.target.closest('#clearTechnologySearch')) {
    const input = document.getElementById('technologySearchInput');
    input.value = '';
    renderHome();
    input.focus();
    return;
  }

  if (event.target.closest('#speechPanelToggle')) {
    const toggle = document.getElementById('speechPanelToggle');
    setSpeechPanelExpanded(toggle.getAttribute('aria-expanded') !== 'true');
    return;
  }

  if (event.target.closest('#retryButton')) {
    if (state.currentSubject) await openSubject(state.currentSubject, true);
    else showHomeView();
    return;
  }

  if (event.target.closest('#themeButton')) {
    state.storage.theme = state.storage.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.storage.theme);
    saveAppState();
    document.getElementById('themeButton').textContent = state.storage.theme === 'dark' ? '☀️' : '🌙';
    return;
  }

  if (event.target.closest('#backToHome') || event.target.closest('#backToHomeBtn')) {
    stopPlayback();
    state.currentSubject = null;
    state.currentQuestionId = null;
    showHomeView();
    renderHome(document.getElementById('technologySearchInput').value);
    return;
  }

  if (event.target.closest('#practiceAgainBtn')) {
    if (state.currentSubject) await openSubject(state.currentSubject, true);
    return;
  }

  if (event.target.closest('#bookmarkBtn')) {
    if (state.currentSubject && state.currentQuestionId) {
      stopPlayback();
      toggleBookmark(state.currentSubject, state.currentQuestionId);
      renderPractice();
    }
    return;
  }

  if (event.target.closest('#weakQuestionBtn')) {
    if (state.currentSubject && state.currentQuestionId) {
      stopPlayback();
      toggleWeak(state.currentSubject, state.currentQuestionId);
      renderPractice();
    }
    return;
  }

  if (event.target.closest('#allQuestionsBtn')) {
    const first = getBankQuestions()[0];
    if (first) {
      stopPlayback();
      state.currentFilter = FILTERS.ALL;
      openPracticeAt(first);
    }
    return;
  }

  if (event.target.closest('#bookmarksBtn')) return applyFilter(FILTERS.BOOKMARKS);
  if (event.target.closest('#weakFilterBtn')) return applyFilter(FILTERS.WEAK);

  if (event.target.closest('#randomBtn')) {
    const question = pickRandomQuestion(state.currentSubject, state.currentFilter);
    if (question) {
      stopPlayback();
      openPracticeAt(question);
    }
    return;
  }

  if (event.target.closest('#readBtn')) {
    const current = getCurrentQuestion();
    if (current) startSequence([current], { label: 'Reading answer', contentMode: 'answer' });
    return;
  }
  if (event.target.closest('#readCurrentBtn')) return readCurrent();
  if (event.target.closest('#questionReadBtn')) {
    const current = getCurrentQuestion();
    if (current) startSequence([current], { label: 'Reading question', contentMode: 'question' });
    return;
  }
  if (event.target.closest('#readFromHereBtn')) return readFromHere();
  if (event.target.closest('#readAllBtn')) return readAll();
  if (event.target.closest('#readRangeBtn')) return readRange();

  if (event.target.closest('#pauseSpeechBtn')) {
    playbackPaused = pauseSpeech();
    updatePlaybackControls(playbackPaused ? 'Speech paused.' : 'Speech could not be paused.');
    return;
  }
  if (event.target.closest('#resumeSpeechBtn')) {
    playbackPaused = !resumeSpeech();
    updatePlaybackControls(playbackPaused ? 'Speech could not be resumed.' : 'Speech resumed.');
    return;
  }
  if (event.target.closest('#stopSpeechBtn')) {
    stopPlayback('Speech stopped.');
    return;
  }

  if (event.target.closest('#prevBtn')) {
    if (isSpeechPlaying() && moveSpeech(-1)) {
      playbackPaused = false;
      updatePlaybackControls();
    } else handlePrevious();
    return;
  }
  if (event.target.closest('#nextBtn')) {
    if (isSpeechPlaying() && moveSpeech(1)) {
      playbackPaused = false;
      updatePlaybackControls();
    } else handleNext();
    return;
  }
  if (event.target.closest('#autoReadToggle')) {
    state.storage.autoRead = !state.storage.autoRead;
    saveAppState();
    updateAutoReadToggle();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'technologySearchInput') {
    renderHome(event.target.value);
    return;
  }
  if (event.target.id !== 'searchInput' || !state.currentSubject) return;
  stopPlayback();
  const term = event.target.value.trim();
  if (!term) {
    document.getElementById('searchResults').classList.add('hidden');
    return;
  }
  renderSearchResults(performSearch(state.currentSubject, term));
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'speechLanguage') {
    stopPlayback();
    state.storage.speechLanguage = event.target.value === 'mr-IN' ? 'mr-IN' : 'en-IN';
    saveAppState();
    updateVoiceStatus();
    renderPractice();
  } else if (event.target.id === 'speechSpeed') {
    state.storage.speechRate = Number(event.target.value);
    saveAppState();
  } else if (event.target.id === 'englishPracticeMode') {
    stopPlayback();
    state.storage.englishPracticeMode = event.target.checked;
    saveAppState();
    renderPractice();
    updateVoiceStatus();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.id === 'searchInput' && event.key === 'Escape') {
    event.target.value = '';
    document.getElementById('searchResults').classList.add('hidden');
  }
  if (event.target.id === 'technologySearchInput' && event.key === 'Escape') {
    event.target.value = '';
    renderHome();
  }
});

window.addEventListener('pagehide', () => {
  stopPlayback();
  unsubscribeVoices?.();
});

async function bootstrap() {
  initializeTheme();
  document.getElementById('themeButton').textContent = state.storage.theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('speechLanguage').value = state.storage.speechLanguage;
  document.getElementById('speechSpeed').value = String(state.storage.speechRate);
  updateAutoReadToggle();
  updateVoiceStatus();
  unsubscribeVoices = subscribeToVoices(() => updateVoiceStatus());

  try {
    showLoading('Loading technology catalog...');
    const response = await fetch('./data/subjects.json');
    if (!response.ok) throw new Error('Unable to load the technology catalog. Please try again.');
    const catalog = await response.json();
    state.subjectCatalog = Array.isArray(catalog) ? catalog : [];
    const results = await Promise.allSettled(state.subjectCatalog.map((subject) => ensureSubjectData(subject.id)));
    const failures = results.filter((result) => result.status === 'rejected');
    renderHome();
    if (failures.length) showError(`${failures.length} question bank${failures.length === 1 ? '' : 's'} could not be loaded. Select a technology to retry.`);
    const previousSubject = state.storage.lastSubject ? getSubjectById(state.storage.lastSubject) : null;
    if (previousSubject) await openSubject(previousSubject.id, true);
    else showHomeView();
  } catch (error) {
    showHomeView();
    showError(error.message || 'Unable to load the technology catalog. Please try again.');
  } finally {
    hideLoading();
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed:', error));
  });
}

bootstrap();
