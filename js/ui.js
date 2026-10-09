
import { state } from './state.js';
import { FILTERS } from './config.js';
import { getCurrentQuestion, getVisibleQuestions } from './question-engine.js';
import { isBookmarked, isWeak, getSubjectStats } from './statistics.js';

export function showLoading(message = 'Loading questions...') {
  const loading = document.getElementById('loadingState');
  const text = document.getElementById('loadingText');
  if (loading) loading.classList.remove('hidden');
  if (text) text.textContent = message;
}

export function hideLoading() {
  const loading = document.getElementById('loadingState');
  if (loading) loading.classList.add('hidden');
}

export function showError(message = 'Unable to load questions. Please try again.') {
  const error = document.getElementById('errorState');
  const text = document.getElementById('errorText');
  if (error) error.classList.remove('hidden');
  if (text) text.textContent = message;
}

export function hideError() {
  const error = document.getElementById('errorState');
  if (error) error.classList.add('hidden');
}

export function renderHome() {
  const grid = document.getElementById('techGrid');
  if (!grid) return;
  grid.innerHTML = state.subjectCatalog.map((subject) => {
    const data = state.subjectData[subject.id] || { questions: [] };
    const count = data.questions ? data.questions.length : 0;
    return `
      <button class="tech-card" type="button" data-subject="${subject.id}" aria-label="Practice ${subject.name}">
        <div class="tech-icon">${subject.icon || '💡'}</div>
        <div>
          <h3>${subject.name}</h3>
          <div class="count-label">${count} Questions</div>
        </div>
        <div class="learn-more">Start Practice</div>
      </button>
    `;
  }).join('');
}

function renderOptions(question) {
  if (!Array.isArray(question.options) || !question.options.length) {
    return '<div class="muted">No multiple-choice options for this question.</div>';
  }
  return question.options.map((option, index) => {
    const label = String.fromCharCode(65 + index);
    return `<button class="option" type="button" data-option="${index}" aria-label="Option ${label}">${label}. ${option}</button>`;
  }).join('');
}

export function renderPractice() {
  const question = getCurrentQuestion();
  if (!question) {
    showError('Unable to load questions. Please try again.');
    return;
  }
  hideError();

  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  const index = questions.findIndex((entry) => entry.id === question.id);
  const currentIndex = index >= 0 ? index : 0;
  const total = questions.length || 1;
  const subjectName = state.subjectCatalog.find((subject) => subject.id === state.currentSubject)?.name || 'Technology';
  const bookmarked = isBookmarked(state.currentSubject, question.id);
  const weak = isWeak(state.currentSubject, question.id);
  const stats = getSubjectStats(state.currentSubject);

  document.getElementById('questionCounter').textContent = `Question ${currentIndex + 1} / ${total}`;
  document.getElementById('questionCategory').textContent = question.category || 'General';
  document.getElementById('techName').textContent = subjectName;
  document.getElementById('questionText').textContent = question.question;
  document.getElementById('answerText').textContent = question.answer || '';
  const marathiWrap = document.getElementById('marathiAnswerWrap');
  if (marathiWrap) {
    marathiWrap.classList.toggle('hidden', !question.answerMarathi);
  }
  const marathiAnswerText = document.getElementById('answerTextMarathi');
  if (marathiAnswerText) {
    marathiAnswerText.textContent = question.answerMarathi || '';
  }
  document.getElementById('explanationText').textContent = question.explanation;
  document.getElementById('optionsContainer').innerHTML = renderOptions(question);
  document.getElementById('exampleWrap').classList.toggle('hidden', !question.example);
  document.getElementById('exampleText').textContent = question.example || '';

  const bookmarkButton = document.getElementById('bookmarkBtn');
  if (bookmarkButton) {
    bookmarkButton.textContent = bookmarked ? '🔖 Bookmarked' : '🔖 Bookmark';
    bookmarkButton.setAttribute('aria-pressed', String(bookmarked));
    bookmarkButton.classList.toggle('active', bookmarked);
  }

  const weakButton = document.getElementById('weakQuestionBtn');
  if (weakButton) {
    weakButton.textContent = weak ? '⚠️ Marked Weak' : '⚠️ Mark Weak';
    weakButton.setAttribute('aria-pressed', String(weak));
    weakButton.classList.toggle('active', weak);
  }

  document.getElementById('nextBtn').textContent = currentIndex === total - 1 ? 'Finish' : 'Next →';
  document.getElementById('prevBtn').disabled = currentIndex === 0;
  document.getElementById('progressBar').style.width = `${((currentIndex + 1) / total) * 100}%`;
  document.getElementById('difficultyBadge').textContent = `Difficulty: ${question.difficulty || 'Beginner'}`;
  document.getElementById('statusBadge').textContent = `🔖 ${stats.bookmarkedCount} • ⚠️ ${stats.weakCount}`;
  const autoToggle = document.getElementById('autoReadToggle');
  if (autoToggle) {
    autoToggle.textContent = `🔊 Auto Read: ${state.storage.autoRead ? 'ON' : 'OFF'}`;
    autoToggle.setAttribute('aria-pressed', String(state.storage.autoRead));
  }

  document.getElementById('themeButton').textContent = state.storage.theme === 'dark' ? '☀️' : '🌙';
}

export function renderSummary() {
  const summaryText = document.getElementById('summaryText');
  const subject = state.currentSubject ? state.subjectData[state.currentSubject] : null;
  const name = subject?.name || 'Selected subject';
  const stats = state.currentSubject ? getSubjectStats(state.currentSubject) : { totalQuestions: 0, bookmarkedCount: 0, weakCount: 0 };
  if (summaryText) {
    summaryText.textContent = `${name}: ${stats.totalQuestions} questions • Bookmarked: ${stats.bookmarkedCount} • Weak: ${stats.weakCount}`;
  }
}

export function renderSearchResults(results) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (!results.length) {
    box.innerHTML = '<div class="no-result">No matching question found.</div>';
    box.classList.remove('hidden');
    return;
  }
  box.innerHTML = results.map((question) => `
    <button class="search-item" type="button" data-subject="${state.currentSubject}" data-question-id="${question.id}">
      <strong>${question.question}</strong>
      <small>${question.category} • ${question.answer.slice(0, 110)}${question.answer.length > 110 ? '...' : ''}</small>
    </button>
  `).join('');
  box.classList.remove('hidden');
}
