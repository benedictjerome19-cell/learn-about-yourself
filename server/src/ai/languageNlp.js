export function languageNlp(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const unique = new Set(words).size;
  const issues = sentences.filter((s) => /^[a-z]/.test(s)).length + (text.match(/\b(\w+)\s+\1\b/gi) || []).length;
  return {
    uniqueWords: unique,
    vocabRichness: words.length ? +(unique / words.length).toFixed(2) : 0,
    avgSentenceLen: sentences.length ? +(words.length / sentences.length).toFixed(1) : 0,
    grammarIssues: issues,
  };
}
