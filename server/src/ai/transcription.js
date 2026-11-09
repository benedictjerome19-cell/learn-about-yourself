import { stripHtml } from '../security.js';

// Text entries: the plain text. Voice/video entries: the note the user typed alongside the
// recording. No speech-to-text service is wired in, so recordings without a note have no
// transcript (rather than an invented one).
export function transcribe(entry) {
  return stripHtml(entry.text || '');
}
