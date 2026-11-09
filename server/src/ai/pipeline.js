import { randomUUID } from 'crypto';
import db from '../db.js';
import { transcribe } from './transcription.js';
import { speechMetrics } from './speechMetrics.js';
import { languageNlp } from './languageNlp.js';
import { score } from './scoring.js';

// Recomputes the transcript and communication score of an entry in place (caller saves).
export function analyzeEntry(entry) {
  entry.transcript = transcribe(entry);
  db.scores = db.scores.filter((s) => s.entryId !== entry.id);
  if (entry.transcript) {
    const speech = speechMetrics(entry.transcript, entry.durationSec);
    const language = languageNlp(entry.transcript);
    db.scores.push({ id: randomUUID(), entryId: entry.id, userId: entry.userId, month: entry.createdAt.slice(0, 7),
      createdAt: entry.createdAt, ...score(speech, language), details: { speech, language } });
  }
  entry.status = 'done';
}
