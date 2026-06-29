// UI behaviour tests for index.html, driven through jsdom. Run with `npm test`
// (or `node test/smoke.test.js`). Exits non-zero on any failed assertion.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const doc = window.document;
const q = (sel) => doc.querySelector(sel);
const qa = (sel) => [...doc.querySelectorAll(sel)];
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) fails++; };

function setVal(el, v) {
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }

// 1. Shell rendered
ok(/Kronolog/.test(q('#root').textContent), 'brand "Kronolog" present');
ok(!!q('#root svg'), 'header shows the logo svg');
const tip = doc.querySelector('a[href="https://ko-fi.com/plabsmedia"]');
ok(!!tip && /Tip/.test(tip.textContent) && tip.getAttribute('target') === '_blank' && /noopener/.test(tip.getAttribute('rel') || ''), 'header has Ko-fi tip button (new tab, noopener)');
const favLink = doc.querySelector('link[rel="icon"]');
ok(!!favLink && /image\/svg\+xml/.test(favLink.getAttribute('type') || '') && /^data:image\/svg\+xml,/.test(favLink.getAttribute('href') || ''), 'svg favicon link injected as data URI');
ok(favLink && /%3Csvg/.test(favLink.getAttribute('href')), 'favicon href is url-encoded svg markup');
ok(qa('#grid > div').length === 42, 'calendar renders 42 cells, got ' + qa('#grid > div').length);
ok(/No time logged this month yet/.test(q('#chartBody').textContent), 'empty chart message shown initially');
const footerTxt = q('#root').textContent;
ok(/IndexedDB/.test(footerTxt) && /only in this browser/.test(footerTxt) && /Backup/.test(footerTxt), 'storage disclaimer shown at bottom of page');

// 2. Add a duration entry for today
const todayStr = (() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })();
setVal(q('[data-field="project"]'), 'Acme Web');
setVal(q('[data-field="ticket"]'), 'ACME-12');
setVal(q('[data-field="hours"]'), '2.5');
setVal(q('[data-field="description"]'), 'Built the <calendar> & "chart"');
setVal(q('[data-field="tags"]'), 'design, review');
click(q('[data-action="addEntry"]'));

let entries = JSON.parse(window.localStorage.getItem('tt_entries_v1'));
ok(entries.length === 1 && entries[0].hours === 2.5 && entries[0].project === 'Acme Web', 'duration entry persisted with hours 2.5');
ok(entries[0].tags.length === 2, 'tags parsed into array');
ok(q('[data-field="project"]').value === '', 'project field cleared after add');
ok(q('[data-field="date"]').value === todayStr, 'date field retained after add');

// chip appears, escaping intact (no raw < breaking markup)
ok(/Acme Web/.test(q('#chips').textContent), 'project chip rendered');
const dayChip = qa('#grid [data-action="deleteEntry"]')[0];
ok(!!dayChip && /2\.5h · ACME-12/.test(dayChip.textContent), 'calendar chip shows "2.5h · ACME-12"');
ok(/Built the <calendar> & "chart"/.test(dayChip.getAttribute('title')), 'tooltip carries description verbatim (decoded), no markup break');

// chart now shows the project + grand total
ok(/Acme Web/.test(q('#chartBody').textContent), 'chart lists Acme Web');
ok(/2\.5h this month/.test(q('#chartTotal').textContent), 'grand total 2.5h this month');

// 3. Range mode
click(q('[data-action="timeMode"][data-mode="range"]'));
ok(!!q('[data-field="start"]') && !!q('[data-field="end"]'), 'range inputs appear');
setVal(q('[data-field="project"]'), 'Acme Web');
setVal(q('[data-field="start"]'), '09:00');
setVal(q('[data-field="end"]'), '11:30');
click(q('[data-action="addEntry"]'));
entries = JSON.parse(window.localStorage.getItem('tt_entries_v1'));
const ranged = entries.find(e => e.start === '09:00');
ok(!!ranged && ranged.hours === 2.5, 'range 09:00–11:30 computed as 2.5h');
ok(/5h this month/.test(q('#chartTotal').textContent), 'grand total now 5h');

// 4. Validation: empty project
click(q('[data-action="timeMode"][data-mode="duration"]'));
click(q('[data-action="addEntry"]'));
ok(/Project is required/.test(q('#error').textContent), 'empty project shows error');
setVal(q('[data-field="project"]'), 'X');
setVal(q('[data-field="hours"]'), '0');
click(q('[data-action="addEntry"]'));
ok(/Enter a valid time/.test(q('#error').textContent), 'zero hours shows error');

// 5. CSV export wiring (stub URL + anchor)
let csvCaptured = null;
window.URL.createObjectURL = (blob) => { csvCaptured = blob; return 'blob:fake'; };
window.URL.revokeObjectURL = () => {};
const origCreate = doc.createElement.bind(doc);
doc.createElement = function (tag) { const el = origCreate(tag); if (tag === 'a') el.click = () => {}; return el; };
click(q('[data-action="exportCsv"]'));
ok(!!csvCaptured, 'CSV export produced a blob');

// 6. Remove-project dialog (hide vs delete)
click(qa('#chips [data-action="removeProject"]')[0]);  // remove "Acme Web"
ok(!!q('[data-action="overlay"]'), 'confirm dialog opens');
ok(/logged entr/.test(q('#dialog').textContent), 'dialog shows entry count text');
// default = hide (keep entries)
const beforeCount = JSON.parse(window.localStorage.getItem('tt_entries_v1')).length;
click(q('[data-action="confirmRemove"]'));
ok(q('#dialog').innerHTML === '', 'dialog closes after confirm');
ok(JSON.parse(window.localStorage.getItem('tt_entries_v1')).length === beforeCount, 'hide keeps entries');
ok(JSON.parse(window.localStorage.getItem('tt_hidden_v1')).indexOf('Acme Web') !== -1, 'project added to hidden list');
ok(!/Acme Web/.test(q('#chips').textContent), 'hidden project removed from picker chips');
ok(/Acme Web/.test(q('#chartBody').textContent), 'hidden project still shows in chart');

// 7. Delete-with-entries path
setVal(q('[data-field="project"]'), 'Temp');
setVal(q('[data-field="hours"]'), '1');
click(q('[data-action="addEntry"]'));
click(qa('#chips [data-action="removeProject"]').find(e => e.getAttribute('data-name') === 'Temp'));
click(q('[data-action="toggleDelete"]'));   // turn on delete
ok(/Delete/.test(q('[data-action="confirmRemove"]').textContent), 'button label becomes "Delete" when toggle on');
click(q('[data-action="confirmRemove"]'));
ok(!JSON.parse(window.localStorage.getItem('tt_entries_v1')).some(e => e.project === 'Temp'), 'delete removes the project entries');

// 7c. Theme support: picker present, switching restyles + persists + updates favicon
click(q('[data-action="openConfig"]'));
const themeBtns = qa('[data-action="setTheme"]');
ok(themeBtns.length === 6, 'config shows 6 theme options, got ' + themeBtns.length);
ok(themeBtns.map(b => b.getAttribute('data-theme')).join(',') === 'warm,ocean,forest,plum,slate,rose', 'theme options in expected order');
const warmBg = q('#root').getAttribute('style');
ok(/#f6efe4/.test(warmBg), 'starts on warm theme (appBg #f6efe4)');
const favBefore = doc.querySelector('link[rel="icon"]').getAttribute('href');
// switch to ocean (config modal stays open; type a workday first to verify it survives)
setVal(q('[data-field="workday"]'), '6');
click(qa('[data-action="setTheme"]').find(b => b.getAttribute('data-theme') === 'ocean'));
ok(/#eef3f6/.test(q('#root').getAttribute('style')), 'switching to ocean restyles the app background');
ok(JSON.parse(window.localStorage.getItem('tt_theme')) === 'ocean', 'theme persisted to localStorage');
ok(doc.querySelector('link[rel="icon"]').getAttribute('href') !== favBefore, 'favicon regenerated with new accent');
ok(q('[data-field="workday"]').value === '6', 'in-progress workday input preserved across theme switch');
const selectedOcean = qa('[data-action="setTheme"]').find(b => b.getAttribute('data-theme') === 'ocean');
ok(/2px solid #2b8aa8/.test(selectedOcean.getAttribute('style')), 'selected theme swatch highlighted with accent ring');
click(q('[data-action="cancelConfig"]'));
ok(q('#configModal').innerHTML === '', 'config modal closes after theme work');

// 8. Month navigation
const beforeLabel = q('#calHead').textContent;
click(q('[data-action="prevMonth"]'));
ok(q('#calHead').textContent !== beforeLabel, 'prevMonth changes month label');
click(q('[data-action="today"]'));

// 8b. Workday fill, overtime stripes, completion lock — in a fresh DOM
(function () {
  const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom2.window, d = w.document;
  const q2 = (s) => d.querySelector(s), qa2 = (s) => [...d.querySelectorAll(s)];
  const sv = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const ck = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const gradOf = (el) => /repeating-linear-gradient/.test(el.getAttribute('style'));
  // default workday = 8; log 4h today -> 50% left-to-right fill, no stripes, no lock
  sv(q2('[data-field="project"]'), 'P'); sv(q2('[data-field="hours"]'), '4'); ck(q2('[data-action="addEntry"]'));
  let cell = qa2('#grid div[title]').find(e => /of 8h/.test(e.getAttribute('title')));
  ok(!!cell && /4h of 8h/.test(cell.getAttribute('title')), 'day cell tooltip reads "4h of 8h"');
  let fill = cell && cell.firstElementChild;
  const fStyle = fill && fill.getAttribute('style');
  ok(fStyle && /width:50%/.test(fStyle) && /left:0/.test(fStyle), 'background fill is 50% of cell width from left (4/8h)');
  ok([...cell.children].every(c => !gradOf(c)), 'no stripe overlay when under target');
  ok(/border:1px/.test(cell.getAttribute('style')) && !cell.querySelector('svg'), 'under-target cell has no lock border or icon');

  // add 6 more -> 10h on 8h day -> full fill + 25% stripe overlay + completion lock
  sv(q2('[data-field="project"]'), 'P'); sv(q2('[data-field="hours"]'), '6'); ck(q2('[data-action="addEntry"]'));
  cell = qa2('#grid div[title]').find(e => /of 8h/.test(e.getAttribute('title')));
  ok(/10h of 8h \(\+2h over\)/.test(cell.getAttribute('title')), 'over-target tooltip shows "+2h over"');
  ok(/width:100%/.test(cell.firstElementChild.getAttribute('style')), 'background fill is full cell width when over target');
  ok(/border:2px solid #d4885a/.test(cell.getAttribute('style')), 'completed (>=100%) cell has bold accent lock border');
  ok(!!cell.querySelector('svg'), 'completed cell shows completion icon (svg)');
  const stripe = cell.children[1];
  const sStyle = stripe && stripe.getAttribute('style');
  ok(!!stripe && /width:25%/.test(sStyle) && gradOf(stripe), 'stripe overlay is 25% width (2/8 over) and striped');
  ok(/left:0/.test(sStyle) && !/right:0/.test(sStyle), 'stripe overlay grows from the left');
  ok(!/#000/.test(sStyle), 'stripe color is accent-based, not black');
  ok([...cell.children].some(c => /z-index:1/.test(c.getAttribute('style'))), 'cell content sits above fill (z-index)');

  // config modal: open, change workday to 4, save -> fill recomputes (10h/4h => capped)
  ck(q2('[data-action="openConfig"]'));
  ok(!!q2('[data-action="configOverlay"]'), 'config modal opens from settings button');
  ok(q2('[data-field="workday"]').value === '8', 'workday input prefilled with 8');
  sv(q2('[data-field="workday"]'), '4'); ck(q2('[data-action="saveConfig"]'));
  ok(q2('#configModal').innerHTML === '', 'config modal closes after save');
  ok(parseFloat(w.localStorage.getItem('tt_workday_v1')) === 4, 'workday 4 persisted');
  cell = qa2('#grid div[title]').find(e => /of 4h/.test(e.getAttribute('title')));
  ok(/10h of 4h \(\+6h over\)/.test(cell.getAttribute('title')), 'fill recomputed against new 4h target');
  ok(/width:100%/.test(cell.children[1].getAttribute('style')), 'stripe overlay width capped at 100% when far over');

  // invalid workday rejected
  ck(q2('[data-action="openConfig"]'));
  sv(q2('[data-field="workday"]'), '0'); ck(q2('[data-action="saveConfig"]'));
  ok(/between 0 and 24/.test(q2('#configError').textContent), 'invalid workday shows error and stays open');
  ck(q2('[data-action="cancelConfig"]'));
  ok(q2('#configModal').innerHTML === '', 'cancel closes config modal');

  // project color palette picker
  ck(q2('[data-action="openConfig"]'));
  const palBtns = qa2('[data-action="setPalette"]');
  ok(palBtns.length === 6, 'config shows 6 palette options, got ' + palBtns.length);
  ok(palBtns.map(b => b.getAttribute('data-palette')).join(',') === 'vivid,pastel,earthy,sunset,cool,candy', 'palette options in expected order');
  ok(/#6366f1/.test(qa2('#grid [data-action="deleteEntry"]')[0].getAttribute('style')), 'project chip uses vivid[0] by default');
  ck(qa2('[data-action="setPalette"]').find(b => b.getAttribute('data-palette') === 'candy'));
  ok(/#ff6b9d/.test(qa2('#grid [data-action="deleteEntry"]')[0].getAttribute('style')), 'switching palette to candy recolors the project chip');
  ok(JSON.parse(w.localStorage.getItem('tt_palette')) === 'candy', 'palette persisted to localStorage');
  ck(q2('[data-action="cancelConfig"]'));
})();

// 9. JSON import roundtrip (async — FileReader)
const backup = { version:1, entries:[{ id:'imp1', date: todayStr, project:'Imported', hours:3, tags:['a'] }], hidden:[] };
const fileInput = q('#fileInput');
const blob = new window.Blob([JSON.stringify(backup)], { type:'application/json' });
const file = blob; file.name = 'b.json';
Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
setTimeout(() => {
  const after = JSON.parse(window.localStorage.getItem('tt_entries_v1'));
  ok(after.some(e => e.project === 'Imported' && e.hours === 3), 'JSON import added "Imported" entry');
  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES'));
  process.exit(fails === 0 ? 0 : 1);
}, 100);
