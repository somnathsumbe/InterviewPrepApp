
export function canUseSpeech() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && Boolean(window.speechSynthesis)
    && typeof window.SpeechSynthesisUtterance === 'function'
    && typeof window.speechSynthesis.speak === 'function';
}

let activeUtterance = null;

export function stopSpeech() {
  if (canUseSpeech()) {
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    window.speechSynthesis.cancel();
  }
}

export function pauseSpeech() {
  if (!canUseSpeech()) return false;
  try {
    window.speechSynthesis.pause();
    return true;
  } catch (error) {
    return false;
  }
}

export function resumeSpeech() {
  if (!canUseSpeech()) return false;
  try {
    window.speechSynthesis.resume();
    return true;
  } catch (error) {
    return false;
  }
}

export function speakQuestion(question, { onEnd = () => {}, onError = () => {} } = {}) {
  if (!question || !canUseSpeech()) {
    return false;
  }

  const parts = [];
  if (question.question) parts.push(`Question: ${question.question}`);

  if (Array.isArray(question.options) && question.options.length) {
    parts.push(`Options: ${question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join(' ')}`);
  }

  if (question.answer) parts.push(`Answer: ${question.answer}`);

  if (question.answerMarathi) parts.push(`Marathi answer: ${question.answerMarathi}`);
  if (question.explanation) parts.push(`Explanation: ${question.explanation}`);
  if (question.example) parts.push(`Example: ${question.example}`);

  if (!parts.length) {
    onError('There is no question or answer content available to read.');
    return false;
  }

  stopSpeech();
  try {
    const utterance = new window.SpeechSynthesisUtterance(parts.join('. '));
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      onEnd();
    };
    utterance.onerror = (event) => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      onError(event.error || 'Speech could not be completed.');
    };
    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    activeUtterance = null;
    onError(error.message || 'Speech could not be started.');
    return false;
  }
}
