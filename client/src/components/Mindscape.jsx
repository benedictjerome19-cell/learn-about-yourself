import { useEffect, useRef } from 'react';

// Dynamic "Mindscape" background: two slow-drifting light orbs whose colours follow
// the current mood. Softer pastels in light mode; a single still frame when the user
// prefers reduced motion.
const MOODS = {
  happy:    [[251, 191, 36], [255, 107, 157]],
  calm:     [[95, 212, 212], [96, 165, 250]],
  neutral:  [[192, 132, 252], [95, 212, 212]],
  active:   [[251, 146, 60], [192, 132, 252]],
  stressed: [[248, 113, 113], [168, 85, 247]],
  sad:      [[99, 102, 241], [100, 116, 139]],
};

export default function Mindscape({ mood = 'neutral', dark = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const [c1, c2] = MOODS[mood] || MOODS.neutral;
    const alpha = dark ? 0.10 : 0.16;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = Math.random() * 100;
    let raf;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (still) draw();
    };

    const orb = (x, y, r, [R, G, B], a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${R},${G},${B},${a})`);
      g.addColorStop(0.45, `rgba(${R},${G},${B},${a * 0.4})`);
      g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    function draw() {
      const w = canvas.width, h = canvas.height, r = Math.max(w, h) * 0.5;
      ctx.clearRect(0, 0, w, h);
      orb(w * (0.22 + Math.sin(t * 0.7) * 0.1), h * (0.3 + Math.cos(t * 0.5) * 0.08), r, c1, alpha);
      orb(w * (0.8 + Math.cos(t * 0.6) * 0.08), h * (0.65 + Math.sin(t * 0.8) * 0.1), r * 0.9, c2, alpha * 0.9);
    }

    const loop = () => {
      t += 0.0025;
      if (!document.hidden) draw();
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    if (still) draw(); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [mood, dark]);

  return <canvas ref={canvasRef} className="mindscape-canvas" aria-hidden="true" />;
}
