import {
  getApps, setApps, getSettings, setSettings, updateApp, deleteApp, computeStats, isFollowUpDue,
  STATUSES, STATUS_LABEL, relTime, fmtDate, daysSince, toCSV,
} from '../lib/store.js';
import { buildDemoApps } from '../lib/demo.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { apps: [], settings: null, view: 'board', q: '', sort: { key: 'updatedAt', dir: -1 }, openId: null };

// ------------------------------------------------------------ data
async function load() {
  [state.apps, state.settings] = await Promise.all([getApps(), getSettings()]);
  render();
  if (state.openId) renderDrawer();
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  if (!q) return state.apps;
  return state.apps.filter((a) =>
    [a.company, a.title, a.location, a.notes, a.source, a.jd && a.jd.text].some((v) => v && v.toLowerCase().includes(q)));
}

// ------------------------------------------------------------ render
function render() {
  renderWelcome();
  renderKpis();
  renderPipeline();
  renderNudge();
  state.view === 'board' ? renderBoard() : renderTable();
}

function renderWelcome() {
  const el = $('#welcome');
  const show = state.apps.length === 0;
  el.hidden = !show;
  if (!show) return;
  el.innerHTML = `
    <div>
      <h2>Your applications, logged as you apply.</h2>
      <p>PaperTrail recognizes job postings on Greenhouse, Lever, Workday, Ashby, iCIMS, LinkedIn, Indeed and any company careers page. When you submit, it logs the application and saves a copy of the job description, so you can still read it after the posting is taken down. You don't need an account or inbox access.</p>
      <div class="actions"><button class="btn primary" id="w-demo">Load demo data</button><button class="btn" id="w-settings">Settings</button></div>
    </div>
    <ol>
      <li><b>Open any job posting.</b> A small PaperTrail card appears in the corner.</li>
      <li><b>Apply as usual.</b> When the "Thanks for applying" page loads, the application is logged for you.</li>
      <li><b>Come back here</b> to see your pipeline, follow-up reminders, and every saved job description.</li>
    </ol>`;
  $('#w-demo').onclick = loadDemo;
  $('#w-settings').onclick = openSettings;
}

function renderKpis() {
  const s = computeStats(state.apps, state.settings.followUpDays);
  const pct = (x) => Math.round(x * 100) + '%';
  $('#kpis').innerHTML = [
    ['Applications sent', s.submitted, `${s.thisWeek} this week`],
    ['Response rate', pct(s.responseRate), 'replied, interview, or rejection'],
    ['Interview rate', pct(s.interviewRate), `${s.interviews} reached interviews`],
    ['Avg. time to reply', s.avgDaysToResponse == null ? '—' : Math.round(s.avgDaysToResponse) + 'd', 'from application date'],
    ['Logged at submit', pct(s.autoRate), 'automatic or one-click confirm'],
    ['Job descriptions saved', s.preserved, 'readable after the posting closes'],
  ].map(([l, n, sub], i) => `<div class="kpi ${i === 4 ? 'accent' : ''}"><div class="l">${l}</div><div class="n">${n}</div><div class="s">${sub}</div></div>`).join('');
}

function renderPipeline() {
  const total = state.apps.length || 1;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, state.apps.filter((a) => a.status === s).length]));
  $('#pipeline').innerHTML = `
    <div class="bar">${STATUSES.map((s) => `<span class="c-${s}" style="width:${(counts[s] / total) * 100}%" title="${STATUS_LABEL[s]}: ${counts[s]}"></span>`).join('')}</div>
    <div class="legend">${STATUSES.map((s) => `<span><i class="c-${s}"></i>${STATUS_LABEL[s]} <b>${counts[s]}</b></span>`).join('')}</div>`;
}

function renderNudge() {
  const due = state.apps.filter((a) => isFollowUpDue(a, state.settings.followUpDays)).sort((a, b) => a.appliedAt - b.appliedAt);
  const el = $('#nudge');
  el.hidden = !due.length;
  if (!due.length) return;
  el.innerHTML = `<span class="msg">⏰ ${due.length} application${due.length > 1 ? 's have' : ' has'} had no update for ${state.settings.followUpDays}+ days. Time for a follow-up note?</span>
    <span class="chips">${due.map((a) => `<button class="chip" data-id="${a.id}">${esc(a.company)} · ${daysSince(a.appliedAt)}d</button>`).join('')}</span>`;
  $$('.chip', el).forEach((b) => (b.onclick = () => openDrawer(b.dataset.id)));
}

function methodTag(a, long = false) {
  if (a.status === 'saved') return '';
  if (a.captureMethod === 'auto-detected') return `<span class="tag auto" title="Logged automatically when you submitted">⚡ ${long ? 'logged automatically' : 'auto'}</span>`;
  if (a.captureMethod === 'prompt') return `<span class="tag auto" title="Submit was seen; you confirmed with one click">✓ ${long ? 'confirmed at submit' : 'confirmed'}</span>`;
  return long ? '<span class="tag">logged by hand</span>' : '';
}

function cardHTML(a) {
  const due = isFollowUpDue(a, state.settings.followUpDays);
  const when = a.status === 'saved' ? `saved ${relTime(a.createdAt)}` : a.appliedAt ? `applied ${relTime(a.appliedAt)}` : relTime(a.updatedAt);
  return `<div class="card is-${a.status}" draggable="true" data-id="${a.id}">
    <div class="co">${esc(a.company)}</div>
    <div class="ti">${esc(a.title)}</div>
    ${a.location || a.salary ? `<div class="lo">${esc([a.location, a.salary].filter(Boolean).join(' · '))}</div>` : ''}
    <div class="ft">
      <span class="tag">${esc(a.source)}</span>
      ${methodTag(a)}
      ${due ? '<span class="tag due">follow up</span>' : ''}
      <span class="when">${when}</span>
    </div>
  </div>`;
}

function renderBoard() {
  const apps = filtered();
  const v = $('#view');
  if (!state.apps.length) { v.innerHTML = ''; return; }
  v.innerHTML = `<div class="board">${STATUSES.map((s) => {
    const list = apps.filter((a) => a.status === s).sort((a, b) => (b.appliedAt || b.createdAt) - (a.appliedAt || a.createdAt));
    return `<section class="col" data-status="${s}">
      <div class="col-h"><span class="name">${STATUS_LABEL[s]}</span><span class="count">${list.length}</span></div>
      <div class="cards">${list.map(cardHTML).join('') || `<div class="col-empty">${state.q ? 'No matches' : 'Drag cards here'}</div>`}</div>
    </section>`;
  }).join('')}</div>`;

  $$('.card', v).forEach((c) => {
    c.onclick = () => openDrawer(c.dataset.id);
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.col', v).forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const a = state.apps.find((x) => x.id === id);
      if (a && a.status !== col.dataset.status) await updateApp(id, { status: col.dataset.status });
    };
  });
}

const COLS = [
  ['company', 'Company'], ['title', 'Role'], ['status', 'Status'], ['source', 'Source'],
  ['appliedAt', 'Applied'], ['updatedAt', 'Last update'], ['captureMethod', 'Logged'],
];
function renderTable() {
  const v = $('#view');
  if (!state.apps.length) { v.innerHTML = ''; return; }
  const { key, dir } = state.sort;
  const order = (a) => (key === 'status' ? STATUSES.indexOf(a.status) : a[key] ?? '');
  const apps = filtered().slice().sort((a, b) => {
    const x = order(a), y = order(b);
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
  v.innerHTML = `<table class="tbl"><thead><tr>${COLS.map(([k, l]) => `<th data-k="${k}" class="${k === key ? 'sorted' + (dir > 0 ? ' asc' : '') : ''}">${l}</th>`).join('')}</tr></thead>
    <tbody>${apps.map((a) => `<tr data-id="${a.id}">
      <td><b>${esc(a.company)}</b><div class="mut">${esc(a.location)}</div></td>
      <td class="ti">${esc(a.title)}</td>
      <td><span class="stamp s-${a.status}">${STATUS_LABEL[a.status]}</span> ${isFollowUpDue(a, state.settings.followUpDays) ? '<span class="tag due">follow up</span>' : ''}</td>
      <td><span class="tag">${esc(a.source)}</span></td>
      <td>${fmtDate(a.appliedAt)}</td>
      <td class="mut">${relTime(a.updatedAt)}</td>
      <td>${methodTag(a) || '<span class="tag">by hand</span>'}</td>
    </tr>`).join('')}</tbody></table>
    ${apps.length ? '' : '<div class="empty-all">No matches.</div>'}`;
  $$('th', v).forEach((th) => (th.onclick = () => {
    const k = th.dataset.k;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
    renderTable();
  }));
  $$('tbody tr', v).forEach((tr) => (tr.onclick = () => openDrawer(tr.dataset.id)));
}

// ------------------------------------------------------------ drawer
function openDrawer(id) {
  state.openId = id;
  renderDrawer();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  history.replaceState(null, '', `?open=${id}`);
}
function closeDrawer() {
  state.openId = null;
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  history.replaceState(null, '', location.pathname);
}

function highlight(text, q) {
  const t = esc(text);
  if (!q || q.length < 2) return t;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return t.replace(re, '<mark>$1</mark>');
}

function renderDrawer() {
  const a = state.apps.find((x) => x.id === state.openId);
  const d = $('#drawer');
  if (!a) { if (state.openId) closeDrawer(); return; }
  if (d.contains(document.activeElement) && document.activeElement.matches('[contenteditable], textarea, input')) return; // don't clobber typing
  const due = isFollowUpDue(a, state.settings.followUpDays);
  d.innerHTML = `
    <div class="d-head">
      <div class="d-top"><span class="stamp s-${a.status}">${STATUS_LABEL[a.status]}</span><span class="tag">${esc(a.source)}</span>${methodTag(a, true)}<button class="close" aria-label="Close">×</button></div>
      <div class="d-title" contenteditable="true" spellcheck="false" data-f="title">${esc(a.title)}</div>
      <div class="d-co" contenteditable="true" spellcheck="false" data-f="company">${esc(a.company)}</div>
      <div class="d-meta">${a.location ? `<span class="tag">📍 ${esc(a.location)}</span>` : ''}${a.salary ? `<span class="tag">💵 ${esc(a.salary)}</span>` : ''}${a.url ? `<a class="tag" href="${esc(a.url)}" target="_blank" rel="noopener">↗ original posting</a>` : ''}</div>
    </div>
    <div class="d-body">
      ${due ? `<div class="d-sec"><div class="followup">⏰ Applied ${daysSince(a.appliedAt)} days ago with no update. Send a short follow-up note to the recruiter.<button class="btn" id="d-fu">Mark followed up</button></div></div>` : ''}
      <div class="d-sec"><label class="lbl">Status</label>
        <div class="statuses">${STATUSES.map((s) => `<button data-s="${s}" class="${s === a.status ? 'on' : ''}">${STATUS_LABEL[s].replace('Interviewing', 'Interview')}</button>`).join('')}</div>
      </div>
      ${a.detection && a.detection.reasons && a.detection.reasons.length ? `<div class="d-sec"><label class="lbl">Why it was logged as applied</label>
        <ul class="why">${a.detection.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      <div class="d-sec facts">
        <div><label class="lbl">Location</label><input class="field" data-f="location" value="${esc(a.location)}"></div>
        <div><label class="lbl">Salary</label><input class="field" data-f="salary" value="${esc(a.salary)}"></div>
      </div>
      <div class="d-sec"><label class="lbl">Notes</label><textarea class="field" data-f="notes" placeholder="Recruiter name, referral, interview prep…">${esc(a.notes)}</textarea></div>
      <div class="d-sec"><label class="lbl">Saved job description</label>
        ${a.jd ? `<div class="jd"><div class="jd-h">Saved ${fmtDate(a.jd.capturedAt)} · ${a.jd.words.toLocaleString()} words<button class="btn" id="d-copy">Copy</button></div><div class="jd-t">${highlight(a.jd.text, state.q)}</div></div>`
               : `<div class="jd"><div class="jd-none">No job description saved. Next time, highlight it on the posting, then right-click and choose "PaperTrail: save selection".</div></div>`}
      </div>
      <div class="d-sec"><label class="lbl">History</label>
        <ul class="timeline">${(a.history || []).map((h) => `<li class="${h.status}"><b>${STATUS_LABEL[h.status]}</b><span class="when">${fmtDate(h.at)}</span>${h.via === 'auto-detected' ? '<span class="via">auto</span>' : h.via === 'prompt' ? '<span class="via">confirmed</span>' : ''}</li>`).join('')}
        ${a.followedUpAt ? `<li><b>Followed up</b><span class="when">${fmtDate(a.followedUpAt)}</span></li>` : ''}</ul>
      </div>
    </div>
    <div class="d-foot"><button class="btn danger" id="d-del">Delete</button><span class="grow"></span>${a.url ? `<a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">Open posting ↗</a>` : ''}<button class="btn primary" id="d-done">Done</button></div>`;

  $('.close', d).onclick = closeDrawer;
  $('#d-done', d).onclick = closeDrawer;
  $('#d-del', d).onclick = async () => { if (confirm(`Delete ${a.title} at ${a.company}?`)) { await deleteApp(a.id); closeDrawer(); } };
  $$('.statuses button', d).forEach((b) => (b.onclick = () => updateApp(a.id, { status: b.dataset.s })));
  $$('[contenteditable][data-f]', d).forEach((el) => {
    el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
    el.onblur = () => { const v = el.textContent.trim(); if (v && v !== a[el.dataset.f]) updateApp(a.id, { [el.dataset.f]: v }); };
  });
  $$('input[data-f], textarea[data-f]', d).forEach((el) => (el.onchange = () => updateApp(a.id, { [el.dataset.f]: el.value })));
  const copy = $('#d-copy', d);
  if (copy) copy.onclick = async () => { await navigator.clipboard.writeText(a.jd.text); copy.textContent = 'Copied ✓'; setTimeout(() => (copy.textContent = 'Copy'), 1400); };
  const fu = $('#d-fu', d);
  if (fu) fu.onclick = () => updateApp(a.id, { followedUpAt: Date.now() });
}

// ------------------------------------------------------------ actions
async function loadDemo() {
  const apps = await getApps();
  const kept = apps.filter((a) => !a.demo);
  await setApps([...kept, ...buildDemoApps()]);
}
async function clearDemo() {
  const apps = await getApps();
  await setApps(apps.filter((a) => !a.demo));
}
function exportCSV() {
  const blob = new Blob([toCSV(filtered())], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `papertrail-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function openSettings() {
  $('#s-auto').checked = state.settings.autoDetect;
  $('#s-card').checked = state.settings.showCard;
  $('#s-days').value = state.settings.followUpDays;
  $('#settings').showModal();
}
$('#settings').addEventListener('close', () => {
  setSettings({ autoDetect: $('#s-auto').checked, showCard: $('#s-card').checked, followUpDays: Math.max(3, Math.min(60, Number($('#s-days').value) || 10)) });
});

$('#q').addEventListener('input', (e) => { state.q = e.target.value; state.view === 'board' ? renderBoard() : renderTable(); if (state.openId) renderDrawer(); });
$('#v-board').onclick = () => { state.view = 'board'; $('#v-board').classList.add('on'); $('#v-table').classList.remove('on'); renderBoard(); };
$('#v-table').onclick = () => { state.view = 'table'; $('#v-table').classList.add('on'); $('#v-board').classList.remove('on'); renderTable(); };
$('#export').onclick = exportCSV;
$('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.openId) closeDrawer(); });

const menu = $('#menu');
$('#menuBtn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#menuBtn').setAttribute('aria-expanded', String(!menu.hidden)); };
document.addEventListener('click', () => (menu.hidden = true));
menu.onclick = async (e) => {
  const m = e.target.dataset.m;
  menu.hidden = true;
  if (m === 'demo') await loadDemo();
  if (m === 'cleardemo') await clearDemo();
  if (m === 'settings') openSettings();
  if (m === 'clear' && confirm('Delete every tracked application? This cannot be undone.')) await setApps([]);
};

chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') load(); });

const params = new URLSearchParams(location.search);
await load();
if (params.get('open')) openDrawer(params.get('open'));
