import db from '../db.js';
import { complete, llmConfigured } from '../ai/llm.js';
import { stripHtml as strip } from '../security.js';

function heuristicBriefing(user) {
  const entries = db.entries.filter(e => e.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (entries.length === 0) return '# Briefing Document\n\nNo entries yet. Start journaling to generate your briefing.';

  const scores = db.scores.filter(s => s.userId === user.id);
  const first  = entries[0];
  const last   = entries[entries.length - 1];

  // Key themes via word frequency
  const allText = entries.map(e => (e.transcript || strip(e.text || '')).toLowerCase()).join(' ');
  const STOP    = new Set(['the','and','for','that','this','with','from','have','been','will','are','was','were','you','your','they','their','but','not','can','all','had','has','its','our','more','out','also','when','what','just','into','than','then','some','there','would','could','about','which','these','after','other','over','only','even','like','know','well','her','him','his','she','him','how','any','did','get','got','now','one','two','don','feels','feel','going','today','really','very','much','time','think','want','along','before','where','while','being','because','again','still','something','things','thing','maybe','little','should','right','those','every','through','around']);
  const freq    = {};
  allText.split(/\W+/).filter(w => w.length > 4 && !STOP.has(w)).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const themes = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);

  // Tag cloud and mood mix
  const tagCloud = {};
  entries.forEach(e => (e.tags || []).forEach(t => { tagCloud[t] = (tagCloud[t] || 0) + 1; }));
  const topTags  = Object.entries(tagCloud).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const moodMix  = {};
  entries.forEach(e => { moodMix[e.mood || 'neutral'] = (moodMix[e.mood || 'neutral'] || 0) + 1; });
  const moods    = Object.entries(moodMix).sort((a, b) => b[1] - a[1]);

  // Score trend
  const avgScore = scores.length ? Math.round(scores.reduce((s, x) => s + (x.communication || 0), 0) / scores.length) : null;
  const firstScore = scores.find(s => s.userId === user.id)?.communication;
  const lastScore  = [...scores].reverse().find(s => s.userId === user.id)?.communication;
  const trend = firstScore && lastScore ? (lastScore - firstScore > 0 ? '📈 Improving' : lastScore - firstScore < 0 ? '📉 Declining' : '→ Stable') : null;

  const lines = [
    `# Briefing Document`,
    `> Generated ${new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    '',
    `## Executive Summary`,
    `You have written **${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'}** spanning from **${new Date(first.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}** to **${new Date(last.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}**. ${avgScore ? `Your average communication score is **${avgScore}/100** with a ${trend} trajectory.` : ''}`,
    '',
    `## Key Themes`,
    themes.length ? themes.map(t => `- **${t}**`).join('\n') : '_Not enough data yet._',
    '',
    `## Mood Overview`,
    moods.map(([m, n]) => `- **${m}** — ${n} entr${n === 1 ? 'y' : 'ies'} (${Math.round((n / entries.length) * 100)}%)`).join('\n'),
    '',
    `## Most Used Tags`,
    topTags.length ? topTags.map(([t, n]) => `- **#${t}** — ${n} entries`).join('\n') : '_No tags used yet._',
    '',
    `## Timeline`,
    ...entries.slice(0, 5).map(e => {
      const date  = new Date(e.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
      const body  = (e.transcript || strip(e.text || '')).slice(0, 120);
      const score = scores.find(s => s.entryId === e.id);
      return `- **${date}** — "${body}${body.length === 120 ? '…' : ''}" ${score ? `_(score: ${score.communication})_` : ''}`;
    }),
    entries.length > 5 ? `\n_…and ${entries.length - 5} more entries_` : '',
    '',
    `## What You've Been Working On`,
    themes.length ? `Based on your writing patterns, your mind has frequently returned to: ${themes.slice(0, 4).join(', ')}.` : '_Write a few longer entries to surface recurring themes._',
    '',
    `---`,
    llmConfigured() ? '' : `_Add an AI API key (e.g. \`GEMINI_API_KEY\`) in \`server/.env\` for a richer AI-generated briefing._`,
  ];

  return lines.filter(l => l !== undefined).join('\n');
}

async function aiBriefing(user) {
  const entries = db.entries.filter(e => e.userId === user.id && (e.transcript || strip(e.text || ''))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!entries.length) return null;
  const ctx = entries.slice(0, 25).map(e => {
    const date = new Date(e.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
    return `[${date} · mood: ${e.mood}] ${e.title ? e.title + ' — ' : ''}${(e.transcript || strip(e.text || '')).slice(0, 300)}`;
  }).join('\n\n');

  const prompt = `You are an executive insight engine for a personal journal. Analyze the following journal entries and produce a structured briefing document in Markdown.

Include:
1. Executive Summary (2-3 sentences)
2. Key Themes (bullet list of recurring topics)
3. Emotional Timeline (how the user's emotional state has evolved)
4. Growth Moments (specific positive shifts noted)
5. Recurring Concerns (patterns of worry or stress)
6. Recommendations (3 actionable suggestions for the user's next journal entries)

JOURNAL ENTRIES:
${ctx}

Respond in structured Markdown only. Be insightful, specific, and grounded in the actual entries.`;

  return complete({ prompt, maxTokens: 1500 });
}

export async function generateBriefing(user) {
  const ai = await aiBriefing(user);
  return ai || heuristicBriefing(user);
}
