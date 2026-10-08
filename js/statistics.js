
import { state, saveAppState } from './state.js';
import { getSubjectQuestions } from './question-engine.js';

export function getSubjectListValue(subjectId, key, fallback = []) {
  const list = state.storage[key]?.[subjectId] ?? fallback;
  return Array.isArray(list) ? list : fallback;
}

export function isBookmarked(subjectId, questionId) {
  return getSubjectListValue(subjectId, 'bookmarks').includes(questionId);
}

export function isWeak(subjectId, questionId) {
  return getSubjectListValue(subjectId, 'weak').includes(questionId);
}

export function toggleBookmark(subjectId, questionId) {
  const list = new Set(getSubjectListValue(subjectId, 'bookmarks'));
  if (list.has(questionId)) list.delete(questionId);
  else list.add(questionId);
  state.storage.bookmarks[subjectId] = Array.from(list);
  saveAppState();
  return isBookmarked(subjectId, questionId);
}

export function toggleWeak(subjectId, questionId) {
  const list = new Set(getSubjectListValue(subjectId, 'weak'));
  if (list.has(questionId)) list.delete(questionId);
  else list.add(questionId);
  state.storage.weak[subjectId] = Array.from(list);
  saveAppState();
  return isWeak(subjectId, questionId);
}

export function markQuestionVisited(subjectId, questionId) {
  const list = new Set(getSubjectListValue(subjectId, 'visited'));
  list.add(questionId);
  state.storage.visited[subjectId] = Array.from(list);
  saveAppState();
}

export function getSubjectStats(subjectId) {
  const questions = getSubjectQuestions(subjectId);
  const visited = new Set(getSubjectListValue(subjectId, 'visited'));
  const bookmarks = getSubjectListValue(subjectId, 'bookmarks');
  const weak = getSubjectListValue(subjectId, 'weak');
  const stats = state.storage.stats[subjectId] || {};
  return {
    totalQuestions: questions.length,
    questionsVisited: visited.size,
    bookmarkedCount: bookmarks.length,
    weakCount: weak.length,
    completedSessions: Number(stats.completedSessions || 0)
  };
}

export function completeSubjectSession(subjectId) {
  const stats = state.storage.stats[subjectId] || {};
  stats.completedSessions = Number(stats.completedSessions || 0) + 1;
  state.storage.stats[subjectId] = stats;
  saveAppState();
}
