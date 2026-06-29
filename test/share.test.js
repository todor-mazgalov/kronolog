// Tests the read-only share feature: a #share= link is built for the current
// month, and opening such a link renders a read-only view without loading or
// writing the viewer's own data. Run with `npm test` (or `node test/share.test.js`).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) fails++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const todayStr = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

(async () => {
  // ---- Page A: a user creates a share link for the current month ----
  const a = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const wa = a.window, da = wa.document;
  const sv = (el, v) => { el.value = v; el.dispatchEvent(new wa.Event('input', { bubbles: true })); };
  const ck = (el) => el.dispatchEvent(new wa.MouseEvent('click', { bubbles: true }));
  let captured = null;
  Object.defineProperty(wa.navigator, 'clipboard', { value: { writeText: (t) => { captured = t; return Promise.resolve(); } }, configurable: true });

  // no entries yet -> Share reports nothing to share
  ck(da.querySelector('[data-action="share"]'));
  ok(captured === null && /No entries to share/.test(da.querySelector('#calHead').textContent), 'Share with an empty month reports nothing to share');

  // add an entry (with a description, to verify full-field sharing)
  sv(da.querySelector('[data-field="project"]'), 'Acme Web');
  sv(da.querySelector('[data-field="ticket"]'), 'ACME-9');
  sv(da.querySelector('[data-field="hours"]'), '3');
  sv(da.querySelector('[data-field="description"]'), 'Secret note');
  ck(da.querySelector('[data-action="addEntry"]'));
  ck(da.querySelector('[data-action="share"]'));
  ok(!!captured && /#share=/.test(captured), 'Share builds a #share link and copies it');

  // ---- Page B: a different person opens the link (fresh, empty storage) ----
  const b = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: captured });
  const wb = b.window, db = wb.document;
  await sleep(40);
  const rootTxt = db.querySelector('#root').textContent;
  ok(/Shared timesheet/.test(rootTxt) && /read-only/.test(rootTxt), 'shared link opens a read-only banner');
  ok(!!db.querySelector('[data-action="exitShare"]'), 'exit shared view button present');
  ok(!db.querySelector('#formCard') && !db.querySelector('[data-action="addEntry"]'), 'no log-time form in shared view');
  ok(!db.querySelector('[data-action="share"]') && !db.querySelector('[data-action="prevMonth"]'), 'no share/nav buttons in shared view');
  ok(/3h · ACME-9/.test(db.querySelector('#grid').textContent), 'shared entries render in the calendar');
  ok(/Acme Web/.test(db.querySelector('#chartBody').textContent), 'shared entries render in the chart');
  const dayChip = db.querySelector('#grid [title*="Acme Web"]');
  ok(!!dayChip && /Secret note/.test(dayChip.getAttribute('title')), 'full fields shared (description present in tooltip)');
  ok(!db.querySelector('#grid [data-action="deleteEntry"]'), 'chips are not deletable in shared view');
  ok(wb.localStorage.getItem('tt_entries_v1') === null, 'shared view does not write entries to viewer storage');

  // export from the shared view (download only — no storage writes)
  ok(!!db.querySelector('[data-action="exportCsv"]') && !!db.querySelector('[data-action="exportJson"]'), 'shared view offers CSV + JSON export');
  let blob = null;
  wb.URL.createObjectURL = (b) => { blob = b; return 'blob:fake'; };
  wb.URL.revokeObjectURL = () => {};
  const origCreate = db.createElement.bind(db);
  db.createElement = function (tag) { const el = origCreate(tag); if (tag === 'a') el.click = () => {}; return el; };
  (db.querySelector('[data-action="exportCsv"]')).dispatchEvent(new wb.MouseEvent('click', { bubbles: true }));
  ok(!!blob, 'CSV export from shared view produces a download');
  ok(wb.localStorage.getItem('tt_entries_v1') === null, 'exporting from shared view still writes nothing to viewer storage');

  // ---- Page C: a normal (no-hash) load still works and is editable ----
  const c = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  await sleep(20);
  ok(!!c.window.document.querySelector('#formCard') && !/Shared timesheet/.test(c.window.document.querySelector('#root').textContent), 'normal load (no #share) shows the editable app');

  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES'));
  process.exit(fails === 0 ? 0 : 1);
})();
