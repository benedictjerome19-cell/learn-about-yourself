// Colours are CSS variables (see src/index.css) so one class set serves both themes.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:       v('bg'),
        surface:  v('surface'),
        elevated: v('elevated'),
        ink:      v('ink'),
        muted:    v('muted'),
        subtle:   v('subtle'),
        line:     v('line'),
        accent:   v('accent'),
        accent2:  v('accent2'),
        onaccent: v('onaccent'),
        danger:   v('danger'),
        warn:     v('warn'),
        ok:       v('ok'),
      },
      fontFamily: {
        sans:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        serif:   ['"Source Serif 4"', 'Georgia', 'serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        lift: '0 2px 4px rgb(0 0 0 / 0.06), 0 18px 40px -16px rgb(0 0 0 / 0.30)',
      },
      keyframes: {
        'fade-in':  { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in':  'fade-in 180ms ease-out',
        'slide-in': 'slide-in 220ms ease-out',
      },
    },
  },
};
