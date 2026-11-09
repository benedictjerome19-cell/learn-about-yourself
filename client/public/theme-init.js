// Runs before first paint so the page never flashes the wrong theme.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('jm_theme') || 'system'; } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
