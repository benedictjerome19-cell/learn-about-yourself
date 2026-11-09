import { Router } from 'express';
import { getStreaks } from '../services/streaks.js';
const r = Router();
r.get('/', (req, res) => res.json(getStreaks(req.user)));
export default r;
