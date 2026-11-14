// PaperTrail content script: detects postings, watches for application submission + confirmation,
// and shows a small on-page card / toast. Runs in every frame; only the top frame draws UI.
(() => {
  if (window.__PT_content) return;
  window.__PT_content = true;

  const IS_TOP = window.top === window;
  const send = (msg) => new Promise((res) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); });
    } catch { res(null); }
  });

  let currentJob = null;
  let tracked = null;
  let settings = { showCard: true, autoDetect: true };
  let lastUrl = location.href;
  let confirmedFor = null;

  // ------------------------------------------------------------------ detection
  function sameFlow(a, b) {
    try {
      const x = new URL(a), y = new URL(b);
      if (x.origin !== y.origin) return false;
      const p = x.pathname.replace(/\/$/, '');
      return y.pathname === x.pathname || y.pathname.startsWith(p + '/');
    } catch { return false; }
  }

  async function detect() {
    if (!window.__PT_extract) return;
    const job = window.__PT_extract();
    if (!job.isJob) {
      // Multi-step apply flows (Workday, SPAs) move to /apply/... on the same posting: keep the job
      if (currentJob && sameFlow(currentJob.url, location.href)) return;
      currentJob = null;
      if (IS_TOP) renderCard();
      return;
    }
    currentJob = job;
    const res = await send({ type: 'JOB_DETECTED', job });
    if (res) {
      tracked = res.tracked;
      settings = res.settings || settings;
    }
    if (IS_TOP) renderCard();
  }

  // ------------------------------------------------------------------ submission + confirmation
  const SUBMIT_TEXT = /^\s*(submit( your| my)?( application)?|send application|complete (my )?application|submit & apply|finish( application)?|apply|review and submit)\s*$/i;
  const CONFIRM_RE = [
    /thank(s| you)[^.!\n]{0,20} for (your )?(applying|application|submitting)/i,
    /\bapplication (has been |was |is )?(successfully )?(submitted|received|sent|complete)/i,
    /we('|’)ve received your application|we have received your application|received your application/i,
    /you('|’)ve (successfully )?applied|you have (successfully )?applied|successfully applied/i,
    /your application (was|has been) sent/i,
  ];
  const URL_CONFIRM = /(confirmation|confirmed|thank[-_]?you|thanks|success|submitted|application[-_]?complete)(\b|[-_/.])/i;

  function looksLikeApplicationForm(form) {
    if (!form) return false;
    if (form.closest('#papertrail-root')) return false;
    const t = (form.innerText || '').slice(0, 4000);
    return !!form.querySelector('input[type="file"], input[type="email"], input[type="tel"], input[name*="resume" i], input[name*="email" i]') || /resume|cv|cover letter|apply/i.test(t);
  }

  const autoOff = () => !!(window.__PT_manualOnly && window.__PT_manualOnly());

  function noteSubmit(source, label = '') {
    if (autoOff()) return;
    const job = currentJob || (window.__PT_extract ? window.__PT_extract() : null);
    send({ type: 'SUBMIT_ATTEMPT', source, label: label.slice(0, 40), job: job && job.title ? job : null });
  }

  document.addEventListener('submit', (e) => {
    if (!looksLikeApplicationForm(e.target)) return;
    const btn = e.submitter;
    noteSubmit('form-submit', btn ? (btn.innerText || btn.value || '').trim() : '');
  }, true);

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, input[type="submit"], a, [role="button"]');
    if (!b || b.closest('#papertrail-root')) return;
    const label = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    if (!SUBMIT_TEXT.test(label)) return;
    const form = b.closest('form');
    // "Apply" alone on a posting page isn't a submission — only count it inside an application form
    if (/^\s*apply\s*$/i.test(label) && !looksLikeApplicationForm(form)) return;
    noteSubmit('button', label);
  }, true);

  function confirmationText() {
    const els = document.querySelectorAll('h1, h2, h3, h4, [role="alert"], [role="status"], [aria-live], [class*="confirm" i], [class*="success" i], [class*="thank" i], [data-testid*="confirm" i]');
    for (const el of els) {
      if (el.closest('#papertrail-root')) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 400) continue;
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue; // hidden
      if (CONFIRM_RE.some((re) => re.test(t))) return t.slice(0, 160);
    }
    return null;
  }

  let confirmPending = false;
  function checkConfirmation() {
    // throttled (not debounced) so pages that mutate constantly can't starve the check
    if (confirmPending) return;
    confirmPending = true;
    setTimeout(async () => {
      confirmPending = false;
      if (autoOff() || confirmedFor === location.href) return;
      const evidence = confirmationText();
      if (!evidence) return;
      confirmedFor = location.href;
      const strong = URL_CONFIRM.test(location.pathname + location.search + location.hash);
      const job = currentJob || (window.__PT_extract ? window.__PT_extract() : null);
      await send({ type: 'CONFIRMATION_DETECTED', evidence, strong, url: location.href, job: job && job.title ? job : null });
    }, 600);
  }

  // SPA support: watch DOM, visibility toggles, and URL changes (pushState / hash routing)
  function onUrlMaybeChanged() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      confirmedFor = null;
      setTimeout(detect, 800);
    }
  }
  const mo = new MutationObserver(() => {
    checkConfirmation();
    onUrlMaybeChanged();
  });
  if (document.body) mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'open'] });
  addEventListener('hashchange', () => { onUrlMaybeChanged(); checkConfirmation(); });
  addEventListener('popstate', () => { onUrlMaybeChanged(); checkConfirmation(); });
  setInterval(onUrlMaybeChanged, 1500);

  // ------------------------------------------------------------------ UI (top frame only)
  let root, shadow, minimized = false;
  const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', interview: 'Interviewing', offer: 'Offer', rejected: 'Rejected' };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ensureRoot() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'papertrail-root';
    root.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; right: 18px; bottom: 18px;';
    shadow = root.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(window.__PT_CSS || '');
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = window.__PT_CSS || '';
      shadow.appendChild(style);
    }
    const wrap = document.createElement('div');
    wrap.className = 'pt';
    shadow.appendChild(wrap);
    document.documentElement.appendChild(root);
  }
  const wrap = () => shadow.querySelector('.pt');

  function renderCard() {
    if (!IS_TOP) return;
    if (!currentJob || settings.showCard === false) {
      if (root) wrap().querySelector('.card')?.remove();
      if (root) wrap().querySelector('.tab')?.remove();
      return;
    }
    ensureRoot();
    const w = wrap();
    w.querySelector('.card')?.remove();
    w.querySelector('.tab')?.remove();

    if (minimized) {
      const tab = document.createElement('button');
      tab.className = 'tab' + (tracked ? ' is-tracked' : '');
      tab.title = 'PaperTrail';
      tab.innerHTML = `<span class="logo">P</span>${tracked ? `<span class="dot"></span>` : ''}`;
      tab.onclick = () => { minimized = false; renderCard(); };
      w.appendChild(tab);
      return;
    }

    const j = currentJob;
    const words = j.description ? j.description.split(/\s+/).length : 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="head">
        <span class="brand"><span class="logo">P</span>PaperTrail</span>
        <span class="src">${esc(j.source)}</span>
        <button class="x" title="Minimize">–</button>
      </div>
      <div class="body">
        <div class="eyebrow">${tracked ? 'In your tracker' : 'Job posting detected'}</div>
        <div class="title">${esc(j.title)}</div>
        <div class="meta">${esc(j.company)}${j.location ? ' · ' + esc(j.location) : ''}${j.salary ? ' · ' + esc(j.salary) : ''}</div>
        ${tracked
          ? `<div class="tracked"><span class="stamp s-${tracked.status}">${STATUS_LABEL[tracked.status]}</span><span class="small">${tracked.jd ? 'Job description saved ✓' : ''}</span></div>
             <div class="actions">${tracked.status === 'saved' ? '<button class="primary" data-a="applied">I applied</button>' : ''}<button class="ghost" data-a="open">Open in tracker</button></div>`
          : `<div class="small">${words ? `Will save the ${words.toLocaleString()}-word job description` : 'Will save this page'} · logs automatically when you submit</div>
             <div class="actions"><button class="primary" data-a="save">Save job</button><button class="ghost" data-a="applied">I already applied</button></div>`}
      </div>`;
    card.querySelector('.x').onclick = () => { minimized = true; renderCard(); };
    card.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'open') return send({ type: 'OPEN_DASHBOARD', appId: tracked && tracked.id });
        b.disabled = true;
        const res = await send({ type: 'SAVE_JOB', job: currentJob, status: a === 'applied' ? 'applied' : 'saved', captureMethod: 'one-click' });
        if (res && res.app) { tracked = res.app; renderCard(); }
      };
    });
    w.appendChild(card);
  }

  function showToast({ kind, app, created, prev, captureMethod }) {
    if (!IS_TOP || !app) return;
    ensureRoot();
    const w = wrap();
    w.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    const words = app.jd ? app.jd.words : 0;
    const head = kind === 'applied'
      ? (captureMethod === 'auto-detected' ? 'Logged automatically' : 'Logged as applied')
      : created ? 'Saved to PaperTrail' : 'Already in PaperTrail';
    const headFinal = kind === 'applied' && captureMethod === 'prompt' ? 'Logged — thanks for confirming' : head;
    t.innerHTML = `
      ${kind === 'applied' ? '<div class="bigstamp">Applied</div>' : ''}
      <div class="t-head">${esc(headFinal)}</div>
      <div class="t-body"><b>${esc(app.title)}</b> at ${esc(app.company)}</div>
      <div class="t-sub">${words ? `Job description saved (${words.toLocaleString()} words)` : 'Posting link saved'}${kind === 'applied' ? ' · follow-up reminder set' : ''}</div>
      ${kind === 'applied' && app.detection && app.detection.reasons && app.detection.reasons.length ? `<details class="t-why"><summary>Why this was logged</summary><ul>${app.detection.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}
      <div class="t-actions"><button data-a="view">View</button><button data-a="undo">Undo</button></div>`;
    t.querySelector('[data-a="view"]').onclick = () => send({ type: 'OPEN_DASHBOARD', appId: app.id });
    t.querySelector('[data-a="undo"]').onclick = async () => {
      await send({ type: 'UNDO', appId: app.id, created, prev });
      t.querySelector('.t-head').textContent = 'Undone';
      t.querySelector('.t-actions').remove();
      setTimeout(() => t.remove(), 1200);
    };
    w.appendChild(t);
    const fade = () => {
      if (t.querySelector('details[open]') || t.matches(':hover')) return setTimeout(fade, 2000); // reading it: keep it up
      t.classList.add('out');
      setTimeout(() => t.remove(), 600);
    };
    setTimeout(fade, 9000);
  }

  // ------------------------------------------------------------------ "Did you just apply?" fallback
  // Submit was clicked but no confirmation message we recognize showed up: ask instead of guessing.
  const PROMPT_DELAY_MS = 6000;
  let pendingTimer = null;
  function schedulePendingCheck(delay = PROMPT_DELAY_MS) {
    if (!IS_TOP) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async () => {
      const res = await send({ type: 'CHECK_PENDING' });
      if (res && res.pending) showPrompt(res.job);
    }, delay);
  }

  function showPrompt(job) {
    ensureRoot();
    const w = wrap();
    w.querySelector('.prompt')?.remove();
    const el = document.createElement('div');
    el.className = 'prompt';
    el.innerHTML = `
      <div class="p-head"><span class="logo">P</span>Did you just apply?</div>
      <div class="p-body"><b>${esc(job.title)}</b> at ${esc(job.company)}</div>
      <div class="p-sub">You clicked Submit, but this page doesn't show a confirmation message PaperTrail recognizes.</div>
      <div class="actions"><button class="primary" data-a="yes">Yes, log it</button><button class="ghost" data-a="no">Not yet</button></div>`;
    el.querySelector('[data-a="yes"]').onclick = async () => {
      el.remove();
      const res = await send({ type: 'SAVE_JOB', job, status: 'applied', captureMethod: 'prompt' });
      if (res && res.app && currentJob) { tracked = res.app; renderCard(); }
    };
    el.querySelector('[data-a="no"]').onclick = () => { el.remove(); send({ type: 'DISMISS_PENDING' }); };
    w.appendChild(el);
  }

  // ------------------------------------------------------------------ messages from popup / background
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_JOB') {
      if (!IS_TOP) return;
      const job = window.__PT_extract ? window.__PT_extract() : null;
      sendResponse({ job, tracked });
      return;
    }
    if (msg.type === 'SHOW_TOAST') { clearTimeout(pendingTimer); wrap && root && wrap().querySelector('.prompt')?.remove(); showToast(msg); }
    if (msg.type === 'SUBMIT_SEEN') schedulePendingCheck();
    if (msg.type === 'TRACKED_UPDATE') { tracked = msg.app; renderCard(); }
  });

  // ------------------------------------------------------------------ boot
  detect();
  checkConfirmation();
  if (IS_TOP) {
    // After a submit that navigated to a new page, give the new page a moment to show a confirmation
    send({ type: 'GET_TAB_CONTEXT' }).then((ctx) => {
      if (ctx && ctx.submitAt && Date.now() - ctx.submitAt < 10 * 60 * 1000) schedulePendingCheck(5000);
    });
  }
})();
