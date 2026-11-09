// Dev-only database viewer (served at /admin/admin.js; kept out of the HTML so the CSP can forbid inline scripts).
let data = {}, cur = 'entries';
async function load() { data = await (await fetch('/admin/data')).json(); draw(); }
function draw() {
  const tabs = document.getElementById('tabs'); tabs.textContent = '';
  Object.keys(data).forEach((k) => {
    const b = document.createElement('button');
    b.textContent = k + ' (' + data[k].length + ')'; b.disabled = k === cur;
    b.onclick = () => { cur = k; draw(); }; tabs.appendChild(b);
  });
  const rows = (data[cur] || []).slice().reverse();
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const t = document.getElementById('t'); t.textContent = '';
  document.getElementById('empty').textContent = rows.length ? '' : 'No rows yet in ' + cur + '.';
  if (!rows.length) return;
  const h = t.insertRow();
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; h.appendChild(th); });
  rows.forEach((r) => {
    const tr = t.insertRow();
    cols.forEach((c) => { const v = r[c]; tr.insertCell().textContent = v && typeof v === 'object' ? JSON.stringify(v) : (v ?? ''); });
  });
}
load(); setInterval(load, 3000);
