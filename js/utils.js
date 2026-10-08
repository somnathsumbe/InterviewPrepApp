
export function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

export function normalizeSubjectId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueList(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];
}

export function textForSearch(question) {
  const source = [
    question?.question,
    question?.answer,
    question?.explanation,
    question?.category,
    ...(Array.isArray(question?.options) ? question.options : []),
    question?.example,
    ...(Array.isArray(question?.tags) ? question.tags : [])
  ];
  return source.join(' ').toLowerCase();
}
