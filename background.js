// PaperTrail service worker: owns per-tab job context, decides when an application was submitted,
// and keeps the toolbar badge in sync with follow-ups that are due.
import { getApps, getSettings, upsertFromJob, findMatch, replaceApp, deleteApp, isFollowUpDue } from './lib/store.js';

const SUBMIT_WINDOW_MS = 45 * 60 * 1000; // a confirmation within 45 min of a submit click counts
const PROMPT_WINDOW_MS = 10 * 60 * 1000; // ask "Did you just apply?" only for submits in the last 10 min
const JOB_FRESH_MS = 60 * 60 * 1000; // ...and only if the posting was seen within the hour before

function minsAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m <= 0 ? 'seconds earlier' : `${m} min earlier`;
}
function submitReason(ctx) {
  if (!ctx.submitAt) return null;
  const what = ctx.submitLabel ? `You clicked "${ctx.submitLabel}"` : 'You submitted an application form';
  return `${what} (${minsAgo(ctx.submitAt)})`;
}
function postingReason(job) {
  if (!job || !job.signals || !job.signals.length) return null;
  return 'Posting recognized from ' + job.signals.slice(0, 3).join(', ');
}

// ---------- per-tab context (survives service-worker restarts via storage.session) ----------
async function getTabs() {
  const { tabs } = await chrome.storage.session.get('tabs');
  return tabs || {};
}
async function setTab(tabId, patch) {
  const tabs = await getTabs();
  tabs[tabId] = { ...(tabs[tabId] || {}), ...patch };
  await chrome.storage.session.set({ tabs });
  return tabs[tabId];
}
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getTabs();
  delete tabs[tabId];
  await chrome.storage.session.set({ tabs });
});

// ---------- badge ----------
async function refreshBadge() {
  const [apps, settings] = await Promise.all([getApps(), getSettings()]);
  const due = apps.filter((a) => isFollowUpDue(a, settings.followUpDays)).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#C2410C' });
  await chrome.action.setBadgeText({ text: due ? String(due) : '' });
  await chrome.action.setTitle({ title: due ? `PaperTrail — ${due} follow-up${due > 1 ? 's' : ''} due` : 'PaperTrail' });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.apps || changes.settings)) refreshBadge();
});

// ---------- install / startup ----------
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pt-save-page', title: 'PaperTrail: save this job', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'pt-applied-page', title: 'PaperTrail: I applied to this job', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'pt-save-selection', title: 'PaperTrail: save selection as the job description', contexts: ['selection'] });
  });
  chrome.alarms.create('pt-followups', { periodInMinutes: 60 });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html?welcome=1') });
  }
  refreshBadge();
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'pt-followups') refreshBadge();
});

// ---------- helpers ----------
async function pageJob(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_JOB', force: true }, { frameId: 0 });
    return res && res.job;
  } catch {
    return null;
  }
}
function toast(tabId, payload) {
  chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', ...payload }, { frameId: 0 }).catch(() => {});
}
function refreshCard(tabId, app) {
  chrome.tabs.sendMessage(tabId, { type: 'TRACKED_UPDATE', app }, { frameId: 0 }).catch(() => {});
}

async function logApplied(tabId, job, captureMethod, detection = null) {
  const { app, created, prev } = await upsertFromJob(job, { status: 'applied', captureMethod, detection });
  await setTab(tabId, { loggedUrl: job.url, loggedAt: Date.now(), submitAt: null });
  toast(tabId, { kind: 'applied', app, created, prev, captureMethod });
  refreshCard(tabId, app);
  return app;
}

// ---------- context menus ----------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id < 0) return;
  const job = (await pageJob(tab.id)) || { title: tab.title, url: tab.url, company: '' };
  if (info.menuItemId === 'pt-save-selection' && info.selectionText) {
    job.description = info.selectionText;
  }
  if (info.menuItemId === 'pt-applied-page') {
    await logApplied(tab.id, job, 'one-click');
  } else {
    const { app, created } = await upsertFromJob(job, { status: 'saved', captureMethod: 'one-click' });
    toast(tab.id, { kind: 'saved', app, created });
    refreshCard(tab.id, app);
  }
});

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e) }));
  return true;
});

async function handle(msg, sender) {
  const tabId = sender.tab ? sender.tab.id : msg.tabId;
  const frameId = sender.frameId || 0;
  switch (msg.type) {
    case 'JOB_DETECTED': {
      // Only the top frame's job sets context (or a frame's job if the top frame has none)
      const ctx = (await getTabs())[tabId] || {};
      if (frameId === 0 || !ctx.job) await setTab(tabId, { job: msg.job, jobAt: Date.now() });
      const apps = await getApps();
      const settings = await getSettings();
      return { tracked: findMatch(apps, msg.job), settings };
    }

    case 'SUBMIT_ATTEMPT': {
      const ctx = (await getTabs())[tabId] || {};
      const patch = { submitAt: Date.now(), submitLabel: msg.label || '', submitSource: msg.source || '' };
      // If the application form itself is on a page without a detectable posting, keep prior job context
      if (!ctx.job && msg.job) { patch.job = msg.job; patch.jobAt = Date.now(); }
      await setTab(tabId, patch);
      // Let the top frame start its "did a confirmation show up?" timer (the submit may come from an iframe)
      chrome.tabs.sendMessage(tabId, { type: 'SUBMIT_SEEN' }, { frameId: 0 }).catch(() => {});
      return { ok: true };
    }

    case 'CONFIRMATION_DETECTED': {
      const settings = await getSettings();
      if (!settings.autoDetect) return { logged: false, reason: 'auto-detect off' };
      const ctx = (await getTabs())[tabId] || {};
      const recentSubmit = ctx.submitAt && Date.now() - ctx.submitAt < SUBMIT_WINDOW_MS;
      if (!recentSubmit && !msg.strong) return { logged: false, reason: 'no submit seen' };
      if (ctx.loggedAt && Date.now() - ctx.loggedAt < 60 * 1000) return { logged: false, reason: 'already logged' };
      const job = ctx.job || msg.job;
      if (!job || !job.title) return { logged: false, reason: 'no job context' };
      const reasons = [
        recentSubmit ? submitReason(ctx) : null,
        `Confirmation message on the page: "${(msg.evidence || '').slice(0, 80)}"`,
        msg.strong ? 'The page address looks like a confirmation page' : null,
        postingReason(job),
      ].filter(Boolean);
      const app = await logApplied(tabId, { ...job, url: job.url || msg.url }, 'auto-detected', { method: 'auto-detected', reasons });
      return { logged: true, app };
    }

    case 'CHECK_PENDING': {
      // Submit was seen but no confirmation was recognized: should we ask "Did you just apply?"
      const settings = await getSettings();
      if (!settings.autoDetect) return { pending: false };
      const ctx = (await getTabs())[tabId] || {};
      const now = Date.now();
      if (!ctx.submitAt || now - ctx.submitAt > PROMPT_WINDOW_MS) return { pending: false };
      if (ctx.loggedAt && ctx.loggedAt >= ctx.submitAt) return { pending: false };
      if (ctx.promptedAt && ctx.promptedAt >= ctx.submitAt) return { pending: false };
      if (!ctx.job || !ctx.job.title || !ctx.jobAt || ctx.submitAt - ctx.jobAt > JOB_FRESH_MS) return { pending: false };
      const existing = findMatch(await getApps(), ctx.job);
      if (existing && existing.status !== 'saved') return { pending: false };
      await setTab(tabId, { promptedAt: now });
      return { pending: true, job: ctx.job };
    }

    case 'DISMISS_PENDING': {
      await setTab(tabId, { submitAt: null });
      return { ok: true };
    }

    case 'SAVE_JOB': {
      const status = msg.status || 'saved';
      const method = msg.captureMethod || 'one-click';
      if (status === 'applied') {
        let detection = null;
        if (method === 'prompt') {
          const ctx = (await getTabs())[tabId] || {};
          detection = {
            method,
            reasons: [submitReason(ctx), 'No confirmation message was found on the page', 'You confirmed it with "Yes, log it"', postingReason(msg.job)].filter(Boolean),
          };
        } else {
          detection = { method, reasons: ['You logged it yourself with "I applied"', postingReason(msg.job)].filter(Boolean) };
        }
        const app = await logApplied(tabId, msg.job, method, detection);
        return { app };
      }
      const { app, created } = await upsertFromJob(msg.job, { status, captureMethod: method });
      if (tabId != null && sender.tab) toast(tabId, { kind: 'saved', app, created });
      if (tabId != null) refreshCard(tabId, app);
      return { app, created };
    }

    case 'UNDO': {
      if (msg.created) await deleteApp(msg.appId);
      else if (msg.prev) await replaceApp(msg.prev);
      if (tabId != null) refreshCard(tabId, msg.created ? null : msg.prev);
      return { ok: true };
    }

    case 'OPEN_DASHBOARD': {
      const url = chrome.runtime.getURL('dashboard/dashboard.html' + (msg.appId ? `?open=${msg.appId}` : ''));
      await chrome.tabs.create({ url });
      return { ok: true };
    }

    case 'GET_TAB_CONTEXT':
      return (await getTabs())[tabId] || {};

    default:
      return { error: 'unknown message' };
  }
}
