import { getApps, getSettings, findMatch, updateApp, computeStats, STATUSES, STATUS_LABEL, relTime } from '../lib/store.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = (msg) => chrome.runtime.sendMessage(msg);

let tab = null;
let job = null;

async function activeTab() {
  const forced = new URLSearchParams(location.search).get('tabId');
  if (forced) return chrome.tabs.get(Number(forced));
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t;
}

async function askPage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_JOB' }, { frameId: 0 });
  } catch {
    // Page was open before the extension loaded — inject on demand (activeTab grants this)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/card-css.js', 'content/extract.js', 'content/content.js'] });
      return await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_JOB' }, { frameId: 0 });
    } catch {
      return null;
    }
  }
}

function openDash(appId) {
  send({ type: 'OPEN_DASHBOARD', appId });
  window.close();
}

async function renderPage() {
  const el = $('#page');
  tab = await activeTab();
  const res = tab && (!tab.url || /^(https?|file):/.test(tab.url)) ? await askPage(tab.id) : null;
  if (!res || !res.job) {
    el.innerHTML = `<div class="empty"><b>Open a job posting to capture it</b>PaperTrail works on Greenhouse, Lever, Workday, Ashby, iCIMS, LinkedIn, Indeed and any company careers page.</div>`;
    return;
  }
  job = res.job;
  const apps = await getApps();
  const tracked = findMatch(apps, job);
  if (tracked) return renderTracked(tracked);

  const words = job.description ? job.description.split(/\s+/).length : 0;
  el.innerHTML = `
    <div class="eyebrow ${job.isJob ? '' : 'unsure'}">${job.isJob ? '● Job posting detected' : job.manualOnly ? `○ Auto-detect is off on ${esc(job.manualOnly)}` : '○ Not sure this is a posting. Check the fields below'}<span class="tag src">${esc(job.source)}</span></div>
    ${job.manualOnly ? `<div class="manual-note">Fill in or check the fields, then save. Use <b>I applied</b> after you submit on ${esc(job.manualOnly)}.</div>` : ''}
    <div class="grid">
      <div class="full"><label class="lbl" for="f-title">Role</label><input class="field title" id="f-title" value="${esc(job.title)}"></div>
      <div><label class="lbl" for="f-company">Company</label><input class="field" id="f-company" value="${esc(job.company)}" placeholder="Company"></div>
      <div><label class="lbl" for="f-loc">Location</label><input class="field" id="f-loc" value="${esc(job.location)}" placeholder="—"></div>
    </div>
    <div class="jdnote">${words > 40 ? `<span class="ok">✓</span> Job description found (${words.toLocaleString()} words). It's saved with the job.` : 'No job description found. Highlight it, then right-click and choose "Save selection".'}</div>
    <div class="row">
      <button class="btn" id="b-save">Save for later</button>
      <button class="btn accent" id="b-applied">I applied</button>
    </div>`;
  const collect = () => ({ ...job, title: $('#f-title').value.trim(), company: $('#f-company').value.trim(), location: $('#f-loc').value.trim() });
  $('#b-save').onclick = async () => {
    const r = await send({ type: 'SAVE_JOB', job: collect(), status: 'saved', tabId: tab.id });
    if (r && r.app) { renderTracked(r.app); renderStats(); }
  };
  $('#b-applied').onclick = async () => {
    const r = await send({ type: 'SAVE_JOB', job: collect(), status: 'applied', tabId: tab.id });
    if (r && r.app) { renderTracked(r.app); renderStats(); }
  };
}

function renderTracked(app) {
  const el = $('#page');
  el.innerHTML = `
    <div class="eyebrow">● In your tracker<span class="tag src">${esc(app.source)}</span></div>
    <div class="tracked">
      <div style="flex:1;min-width:0">
        <h3>${esc(app.title)}</h3>
        <div class="sub">${esc(app.company)}${app.location ? ' · ' + esc(app.location) : ''}</div>
      </div>
      <span class="stamp s-${app.status}">${STATUS_LABEL[app.status]}</span>
    </div>
    <div class="statusbar">${STATUSES.map((s) => `<button data-s="${s}" class="${s === app.status ? 'on' : ''}">${STATUS_LABEL[s].replace('Interviewing', 'Interview')}</button>`).join('')}</div>
    <div class="jdnote">${app.jd ? `<span class="ok">✓</span> Job description saved ${relTime(app.jd.capturedAt)} (${app.jd.words.toLocaleString()} words)` : 'No job description saved yet'}</div>
    <div class="row"><button class="btn" id="b-open">Open details</button></div>`;
  el.querySelectorAll('[data-s]').forEach((b) => {
    b.onclick = async () => {
      const updated = await updateApp(app.id, { status: b.dataset.s });
      if (tab) chrome.tabs.sendMessage(tab.id, { type: 'TRACKED_UPDATE', app: updated }, { frameId: 0 }).catch(() => {});
      renderTracked(updated);
      renderStats();
      renderRecent();
    };
  });
  $('#b-open').onclick = () => openDash(app.id);
  renderRecent();
}

async function renderStats() {
  const [apps, settings] = await Promise.all([getApps(), getSettings()]);
  const s = computeStats(apps, settings.followUpDays);
  $('#stats').innerHTML = `
    <div class="stat"><div class="n">${s.thisWeek}</div><div class="l">Applied<br>this week</div></div>
    <div class="stat"><div class="n">${s.interviews}</div><div class="l">Interview<br>stage</div></div>
    <div class="stat ${s.followUps ? 'hot' : ''}"><div class="n">${s.followUps}</div><div class="l">Follow-ups<br>due</div></div>`;
}

async function renderRecent() {
  const apps = (await getApps()).slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  $('#recent').innerHTML = apps.length
    ? apps.map((a) => `<li data-id="${a.id}"><div class="grow"><div class="t">${esc(a.title)}</div><div class="c">${esc(a.company)} · ${relTime(a.updatedAt)}</div></div><span class="stamp s-${a.status}">${STATUS_LABEL[a.status]}</span></li>`).join('')
    : `<li class="none">Nothing tracked yet. Open any job posting to start.</li>`;
  $('#recent').querySelectorAll('li[data-id]').forEach((li) => (li.onclick = () => openDash(li.dataset.id)));
}

$('#openDash').onclick = () => openDash();
$('#seeAll').onclick = (e) => { e.preventDefault(); openDash(); };
renderPage();
renderStats();
renderRecent();
