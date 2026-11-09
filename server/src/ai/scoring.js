const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
export function score(sp, lg) {
  const pace = clamp(100 - Math.abs(sp.wpm - 140) * 0.8);
  const clarity = clamp(100 - sp.fillerRate * 8);
  const vocabulary = clamp(lg.vocabRichness * 70 + Math.min(lg.uniqueWords, 60) * 0.5);
  const grammar = clamp(100 - lg.grammarIssues * 10);
  return { pace, clarity, vocabulary, grammar,
    communication: clamp(pace * 0.25 + clarity * 0.3 + vocabulary * 0.25 + grammar * 0.2) };
}
