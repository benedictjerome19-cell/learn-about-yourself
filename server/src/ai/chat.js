// Source-grounded chat with past journal entries.
// Uses the configured LLM provider (see llm.js), falls back to heuristic matching.
import { complete, llmConfigured } from './llm.js';
import { stripHtml } from '../security.js';

const bodyOf = (e) => [e.title, e.transcript || stripHtml(e.text || '')].filter(Boolean).join(' — ');
const fmtDate = (d) => new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Keyword-relevance chat (zero-cost fallback when no API key is present).
 * Returns an answer grounded in the user's actual entries.
 */
function heuristicChat(question, entries) {
  const q = question.toLowerCase().trim();

  // Greetings / short openers
  const greetings = ['hi', 'hello', 'hey', 'sup', 'yo', 'hiya', 'howdy'];
  if (greetings.some(g => q === g || q === g + '!' || q === g + '?')) {
    const count = entries.length;
    return `Hey! 👋 I'm your Past Self — I've been through ${count} journal entr${count === 1 ? 'y' : 'ies'} with you. Ask me anything meaningful: *"What did I used to worry about?"*, *"What patterns do you see in my thinking?"*, or *"How have I grown?"*`;
  }

  if (!entries.length) return "We haven't written anything together yet. Write your first entry and I'll be able to reflect it back to you.";

  // Generic questions with no entry context
  if (q.length < 10) {
    return `Ask me something specific about your past — your worries, goals, feelings, or growth. I can only answer from what you've actually written. Try: *"What themes keep coming up in my entries?"*`;
  }

  // Score entries by keyword overlap
  const words = q.split(/\W+/).filter(w => w.length > 3);
  const scored = entries
    .map(e => {
      const body = bodyOf(e).toLowerCase();
      const score = words.reduce((s, w) => s + (body.includes(w) ? 1 : 0), 0) + (words.includes(e.mood) ? 1 : 0);
      return { ...e, _score: score };
    })
    .filter(e => e._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  if (scored.length === 0) {
    return "I couldn't find entries directly related to that question. Try asking about topics you've written about — your worries, goals, or feelings.";
  }

  const excerpts = scored.map(e => {
    const body = bodyOf(e).slice(0, 200);
    return `**${fmtDate(e.createdAt)}** (${e.mood}): "${body}${body.length === 200 ? '…' : ''}"`;
  });

  return [
    `Based on your past entries, here's what I found:\n`,
    ...excerpts,
    `\n_I found ${scored.length} relevant entr${scored.length === 1 ? 'y' : 'ies'}.${llmConfigured() ? '' : ' Add an AI API key in `server/.env` for deeper reflections.'}_`,
  ].join('\n');
}

export async function chatWithPastSelf(question, entries) {
  const withText = entries.filter((e) => bodyOf(e));
  if (llmConfigured()) {
    const ctx = withText.slice(0, 30).map(e => `[${fmtDate(e.createdAt)} · mood: ${e.mood}] ${bodyOf(e).slice(0, 400)}`).join('\n\n');
    const answer = await complete({
      system: `You are the user's Past Self speaking in first person. You have access ONLY to the following journal entries — do not invent anything outside them. Answer thoughtfully and introspectively, citing specific dates and moments.

JOURNAL ENTRIES:
${ctx || '(No entries yet — warmly encourage the user to start journaling)'}`,
      prompt: question,
      maxTokens: 500,
    });
    if (answer) return answer;
  }
  return heuristicChat(question, withText);
}
