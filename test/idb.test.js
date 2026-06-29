// Tests the IndexedDB primary-store path: dual-write, migration from a
// localStorage-only install, and adoption on reload. Shares one in-memory
// fake-indexeddb factory across two JSDOM "page loads". Run with `npm test`
// (or `node test/idb.test.js`).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) fails++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// One shared factory => data survives across the two JSDOM instances below.
const sharedIDB = new IDBFactory();

function makePage(seedLocalStorage) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(window) {
      window.indexedDB = sharedIDB;
      window.IDBKeyRange = IDBKeyRange;
      if (seedLocalStorage) for (const [k, v] of Object.entries(seedLocalStorage)) window.localStorage.setItem(k, v);
    }
  });
  return dom;
}
function rawGet(db, key) {
  return new Promise((res, rej) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function openDb() {
  return new Promise((res, rej) => { const q = sharedIDB.open('kronolog', 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}

(async () => {
  // ---- Page 1: fresh install seeded with legacy localStorage data ----
  const legacy = {
    tt_entries_v1: JSON.stringify([{ id: 'leg1', date: '2026-06-01', project: 'Legacy', hours: 3, tags: [] }]),
    tt_hidden_v1: JSON.stringify(['OldHidden']),
    tt_workday_v1: JSON.stringify(7)
  };
  const dom1 = makePage(legacy);
  const w1 = dom1.window, d1 = w1.document;
  const sv = (el, v) => { el.value = v; el.dispatchEvent(new w1.Event('input', { bubbles: true })); };
  const ck = (el) => el.dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));

  await sleep(120); // let initStorage() open IDB + migrate

  const db = await openDb();
  let idbEntries = await rawGet(db, 'tt_entries_v1');
  ok(Array.isArray(idbEntries) && idbEntries.length === 1 && idbEntries[0].id === 'leg1', 'legacy localStorage entries migrated into IndexedDB');
  ok(JSON.stringify(await rawGet(db, 'tt_hidden_v1')) === JSON.stringify(['OldHidden']), 'hidden list migrated into IndexedDB');
  ok((await rawGet(db, 'tt_workday_v1')) === 7, 'workday migrated into IndexedDB');

  // add a new entry in page 1 -> should dual-write to IDB
  sv(d1.querySelector('[data-field="project"]'), 'NewProj');
  sv(d1.querySelector('[data-field="hours"]'), '5');
  ck(d1.querySelector('[data-action="addEntry"]'));
  await sleep(40);
  idbEntries = await rawGet(db, 'tt_entries_v1');
  ok(idbEntries.length === 2 && idbEntries.some(e => e.project === 'NewProj' && e.hours === 5), 'new entry dual-written to IndexedDB');

  // change workday via config -> dual-write
  ck(d1.querySelector('[data-action="openConfig"]'));
  sv(d1.querySelector('[data-field="workday"]'), '9');
  ck(d1.querySelector('[data-action="saveConfig"]'));
  await sleep(40);
  ok((await rawGet(db, 'tt_workday_v1')) === 9, 'workday change dual-written to IndexedDB');

  // change theme -> dual-write
  ck(d1.querySelector('[data-action="openConfig"]'));
  ck([...d1.querySelectorAll('[data-action="setTheme"]')].find(b => b.getAttribute('data-theme') === 'forest'));
  await sleep(40);
  ok((await rawGet(db, 'tt_theme')) === 'forest', 'theme change dual-written to IndexedDB');

  // change project-color palette -> dual-write
  ck(d1.querySelector('[data-action="openConfig"]'));
  ck([...d1.querySelectorAll('[data-action="setPalette"]')].find(b => b.getAttribute('data-palette') === 'candy'));
  await sleep(40);
  ok((await rawGet(db, 'tt_palette')) === 'candy', 'palette change dual-written to IndexedDB');
  db.close();

  // ---- Page 2: reload (empty localStorage) -> adopt from IndexedDB ----
  const dom2 = makePage(null); // no localStorage seed: simulates cache cleared
  const w2 = dom2.window, d2 = w2.document;
  ok(w2.localStorage.getItem('tt_entries_v1') === null, 'page 2 starts with empty localStorage cache');
  await sleep(140); // initStorage adopts from IDB and re-renders

  const cells = [...d2.querySelectorAll('#grid [data-action="deleteEntry"]')];
  const labels = cells.map(c => c.textContent).join(' | ');
  ok(/Legacy/.test(labels) && /NewProj/.test(labels), 'page 2 recovered both entries from IndexedDB after localStorage was cleared');
  ok(/of 9h/.test([...d2.querySelectorAll('#grid div[title]')].map(e => e.getAttribute('title')).join(' ')), 'page 2 recovered workday=9 from IndexedDB');
  ok(/#eef2ec/.test(d2.querySelector('#root').getAttribute('style')), 'page 2 recovered forest theme from IndexedDB');
  ok(/#ff6b9d/.test([...d2.querySelectorAll('#grid [data-action="deleteEntry"]')].map(c => c.getAttribute('style')).join(' ')), 'page 2 recovered candy palette from IndexedDB');
  // adoption should have rewritten the localStorage cache
  ok(JSON.parse(w2.localStorage.getItem('tt_entries_v1')).length === 2, 'adoption refreshed the localStorage cache');

  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES'));
  process.exit(fails === 0 ? 0 : 1);
})();
