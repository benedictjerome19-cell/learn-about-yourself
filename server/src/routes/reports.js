import { Router } from 'express';
import { monthlyReport } from '../services/reports.js';
import { generateBriefing } from '../services/briefing.js';
import { RANGES, emotionalAnalysis } from '../services/emotions.js';
import { renderEmotionReport } from '../services/emotionReportPdf.js';

const r = Router();

r.get('/', (req, res) => res.json(monthlyReport(req.user)));

r.post('/briefing', async (req, res) => {
  try {
    const briefing = await generateBriefing(req.user);
    res.json({ briefing });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Emotional analysis: ?range=30|90|365|all (default 30 days)
const range = (req) => (RANGES[req.query.range] ? String(req.query.range) : '30');

r.get('/emotions', (req, res) => res.json(emotionalAnalysis(req.user, range(req))));

r.get('/emotions.pdf', (req, res, next) => {
  try {
    const analysis = emotionalAnalysis(req.user, range(req));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="journalmind-emotional-report-${analysis.to}.pdf"`,
    });
    renderEmotionReport(analysis, res);
  } catch (e) { next(e); }
});

export default r;
