
import { state } from './state.js';

function showSection(sectionId) {
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });
}

export function showHomeView() {
  state.view = 'home';
  showSection('home-view');
}

export function showPracticeView() {
  state.view = 'practice';
  showSection('practice-view');
}

export function showSummaryView() {
  state.view = 'summary';
  showSection('summary-view');
}
