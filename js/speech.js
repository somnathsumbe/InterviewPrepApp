
export function canUseSpeech() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeech() {
  if (canUseSpeech()) {
    window.speechSynthesis.cancel();
  }
}

export function speakQuestion(question) {
  if (!question || !canUseSpeech()) {
    return false;
  }

  stopSpeech();
  const parts = [`Question: ${question.question || ''}`];

  if (Array.isArray(question.options) && question.options.length) {
    parts.push(`Options: ${question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join(' ')}`);
  }

  if (question.answer) {
    parts.push(`Answer: ${question.answer}`);
  }

  if (question.explanation) {
    parts.push(`Explanation: ${question.explanation}`);
  }

  if (question.example) {
    parts.push(`Example: ${question.example}`);
  }

  const utterance = new SpeechSynthesisUtterance(parts.join('. '));
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
  return true;
}
