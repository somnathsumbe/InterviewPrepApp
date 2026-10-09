
import { FILTERS } from './config.js';
import { normalizeSubjectId, uniqueList } from './utils.js';
import { state, saveAppState } from './state.js';
import { isBookmarked, isWeak, markQuestionVisited } from './statistics.js';

const subjectCache = new Map();

function normalizeQuestion(subjectId, rawQuestion, index) {
  const options = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
  const tags = Array.isArray(rawQuestion.tags) ? rawQuestion.tags : [];
  return {
    id: rawQuestion.id || `${subjectId}-${String(index + 1).padStart(3, '0')}`,
    category: rawQuestion.category || 'General',
    difficulty: rawQuestion.difficulty || 'Beginner',
    question: rawQuestion.question || '',
    options,
    answer: rawQuestion.answer || '',
    answerMarathi: rawQuestion.answerMarathi || '',
    explanation: rawQuestion.explanation || '',
    example: rawQuestion.example || '',
    tags: uniqueList(tags)
  };
}

export async function loadSubjectCatalog() {
  const response = await fetch('./data/subjects.json');
  if (!response.ok) throw new Error('Unable to load questions. Please try again.');
  const data = await response.json();
  state.subjectCatalog = Array.isArray(data) ? data : [];
  return state.subjectCatalog;
}

export function getSubjectById(subjectId) {
  return state.subjectCatalog.find((subject) => {
    const id = normalizeSubjectId(subject.id);
    const name = normalizeSubjectId(subject.name);
    return id === normalizeSubjectId(subjectId) || name === normalizeSubjectId(subjectId);
  }) || null;
}

export async function ensureSubjectData(subjectId) {
  const subject = getSubjectById(subjectId) || { id: normalizeSubjectId(subjectId), name: String(subjectId), file: `${normalizeSubjectId(subjectId)}.json` };
  const resolvedId = normalizeSubjectId(subject.id || subject.name || subjectId);
  if (subjectCache.has(resolvedId)) {
    state.subjectData[resolvedId] = subjectCache.get(resolvedId);
    return state.subjectData[resolvedId];
  }

  const url = `./data/${subject.file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load questions. Please try again.');

  const payload = await response.json();
  const normalizedQuestions = Array.isArray(payload.questions)
    ? payload.questions.map((question, index) => normalizeQuestion(resolvedId, question, index))
    : [];

  const data = {
    ...payload,
    id: resolvedId,
    name: payload.subject || subject.name || String(subjectId),
    questions: normalizedQuestions
  };

  state.subjectData[resolvedId] = data;
  subjectCache.set(resolvedId, data);
  return data;
}

export function getSubjectQuestions(subjectId) {
  const resolvedId = normalizeSubjectId(subjectId);
  return state.subjectData[resolvedId]?.questions || [];
}

export function getCurrentQuestion() {
  if (!state.currentSubject) return null;
  const questions = getVisibleQuestions(state.currentSubject, state.currentFilter);
  if (!questions.length) return null;
  const match = questions.find((question) => question.id === state.currentQuestionId);
  return match || questions[0];
}

export function getVisibleQuestions(subjectId = state.currentSubject, filter = state.currentFilter) {
  const questions = getSubjectQuestions(subjectId || state.currentSubject);
  if (!questions.length) return [];
  if (filter === FILTERS.BOOKMARKS) {
    return questions.filter((question) => isBookmarked(subjectId, question.id));
  }
  if (filter === FILTERS.WEAK) {
    return questions.filter((question) => isWeak(subjectId, question.id));
  }
  return questions;
}

export function setCurrentQuestion(subjectId, questionId, filter = state.currentFilter) {
  const questions = getVisibleQuestions(subjectId, filter);
  if (!questions.length) return null;
  const match = questions.find((question) => question.id === questionId) || questions[0];
  state.currentSubject = subjectId;
  state.currentFilter = filter;
  state.currentQuestionId = match.id;
  state.storage.lastSubject = subjectId;
  state.storage.lastQuestion[subjectId] = match.id;
  saveAppState();
  markQuestionVisited(subjectId, match.id);
  return match;
}

export function setCurrentSubjectAndResume(subjectId, filter = FILTERS.ALL) {
  const questions = getVisibleQuestions(subjectId, filter);
  if (!questions.length) return null;
  const preferredId = state.storage.lastQuestion[subjectId] || questions[0].id;
  const match = questions.find((question) => question.id === preferredId) || questions[0];
  state.currentSubject = subjectId;
  state.currentFilter = filter;
  state.currentQuestionId = match.id;
  state.storage.lastSubject = subjectId;
  state.storage.lastQuestion[subjectId] = match.id;
  saveAppState();
  markQuestionVisited(subjectId, match.id);
  return match;
}

export function moveCurrentQuestion(offset) {
  const subjectId = state.currentSubject;
  const questions = getVisibleQuestions(subjectId, state.currentFilter);
  if (!questions.length) return null;
  let index = questions.findIndex((question) => question.id === state.currentQuestionId);
  if (index === -1) index = 0;
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= questions.length) return null;
  const nextQuestion = questions[nextIndex];
  setCurrentQuestion(subjectId, nextQuestion.id, state.currentFilter);
  return nextQuestion;
}

export function pickRandomQuestion(subjectId = state.currentSubject, filter = state.currentFilter) {
  const questions = getVisibleQuestions(subjectId, filter);
  if (!questions.length) return null;
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
}
