
import { state } from './state.js';
import { getVisibleQuestions } from './question-engine.js';
import { textForSearch } from './utils.js';

export function performSearch(subjectId, rawTerm) {
  const term = String(rawTerm || '').trim().toLowerCase();
  if (!term) return [];
  const questions = getVisibleQuestions(subjectId, state.currentFilter);
  return questions.filter((question) => textForSearch(question).includes(term));
}
