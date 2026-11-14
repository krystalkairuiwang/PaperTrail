// PaperTrail storage layer — everything lives in chrome.storage.local (no account, no server).

export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
export const STATUS_LABEL = {
  saved: 'Saved',
  applied: 'Applied',
  interview: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

export const DEFAULT_SETTINGS = {
  followUpDays: 10,
  autoDetect: true,
  showCard: true,
};

const DAY = 86400000;

export function uid() {
  return 'pt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    const keep = ['gh_jid', 'jk', 'currentJobId', 'jobId', 'id'];
    const params = new URLSearchParams();
    for (const k of keep) if (url.searchParams.get(k)) params.set(k, url.searchParams.get(k));
    let path = url.pathname.replace(/\/(apply|application|confirmation|thank-you|thanks)\/?$/i, '').replace(/\/$/, '');
    const q = params.toString();
    return (url.protocol === 'file:' ? 'file://' : url.host) + path + (q ? '?' + q : '');
  } catch {
    return u;
  }
}

export async function getApps() {
  const { apps } = await chrome.storage.local.get('apps');
  return Array.isArray(apps) ? apps : [];
}

export async function setApps(apps) {
  await chrome.storage.local.set({ apps });
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function setSettings(patch) {
  const cur = await getSettings();
  await chrome.storage.local.set({ settings: { ...cur, ...patch } });
}

export function findMatch(apps, job) {
  if (!job) return null;
  const cu = canonicalUrl(job.url);
  const byUrl = cu && apps.find((a) => a.canonicalUrl === cu);
  if (byUrl) return byUrl;
  const c = norm(job.company);
  const t = norm(job.title);
  if (!c || !t) return null;
  return apps.find((a) => norm(a.company) === c && norm(a.title) === t) || null;
}

/**
 * Insert or update an application from a captured job.
 * status: target status (only moves forward from 'saved' → 'applied'; never downgrades)
 */
export async function upsertFromJob(job, { status = 'saved', captureMethod = 'one-click', detection = null } = {}) {
  const apps = await getApps();
  const now = Date.now();
  let app = findMatch(apps, job);
  let created = false;
  const prev = app ? JSON.parse(JSON.stringify(app)) : null;

  if (!app) {
    created = true;
    app = {
      id: uid(),
      title: job.title || 'Untitled role',
      company: job.company || 'Unknown company',
      location: job.location || '',
      salary: job.salary || '',
      url: job.url || '',
      canonicalUrl: canonicalUrl(job.url),
      source: job.source || 'Company site',
      status: 'saved',
      captureMethod,
      createdAt: now,
      appliedAt: null,
      updatedAt: now,
      followedUpAt: null,
      notes: '',
      history: [{ status: 'saved', at: now, via: captureMethod }],
      jd: null,
    };
    apps.unshift(app);
  }

  // Fill gaps, never overwrite user edits with blanks
  for (const k of ['location', 'salary', 'url', 'source']) {
    if (!app[k] && job[k]) app[k] = job[k];
  }
  if (!app.canonicalUrl && job.url) app.canonicalUrl = canonicalUrl(job.url);

  // Snapshot the job description the first time we see a real one (or a longer one)
  if (job.description && job.description.length > 120) {
    const words = job.description.split(/\s+/).filter(Boolean).length;
    if (!app.jd || (app.jd.words || 0) < words * 0.8) {
      app.jd = { text: job.description, words, capturedAt: now, fromUrl: job.url || app.url };
    }
  }

  if (status === 'applied' && app.status === 'saved') {
    app.status = 'applied';
    app.appliedAt = now;
    app.captureMethod = captureMethod;
    app.history.push({ status: 'applied', at: now, via: captureMethod });
    if (detection) app.detection = { ...detection, at: now };
  }
  app.updatedAt = now;
  await setApps(apps);
  return { app, created, prev };
}

export async function updateApp(id, patch) {
  const apps = await getApps();
  const i = apps.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const app = apps[i];
  const now = Date.now();
  if (patch.status && patch.status !== app.status) {
    app.history = app.history || [];
    app.history.push({ status: patch.status, at: now, via: 'manual' });
    if (patch.status === 'applied' && !app.appliedAt) app.appliedAt = now;
  }
  Object.assign(app, patch, { updatedAt: now });
  await setApps(apps);
  return app;
}

export async function replaceApp(app) {
  const apps = await getApps();
  const i = apps.findIndex((a) => a.id === app.id);
  if (i >= 0) apps[i] = app;
  await setApps(apps);
}

export async function deleteApp(id) {
  const apps = await getApps();
  await setApps(apps.filter((a) => a.id !== id));
}

export function isFollowUpDue(app, followUpDays) {
  if (app.status !== 'applied' || !app.appliedAt) return false;
  const since = Math.max(app.appliedAt, app.followedUpAt || 0);
  return Date.now() - since > followUpDays * DAY;
}

export function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / DAY);
}

export function relTime(ts) {
  const d = daysSince(ts);
  if (d === null) return '—';
  if (d === 0) {
    const h = Math.floor((Date.now() - ts) / 3600000);
    return h <= 0 ? 'just now' : `${h}h ago`;
  }
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function computeStats(apps, followUpDays) {
  const submitted = apps.filter((a) => a.status !== 'saved');
  const responded = submitted.filter((a) => ['interview', 'offer', 'rejected'].includes(a.status));
  const interviews = submitted.filter((a) => ['interview', 'offer'].includes(a.status) || (a.history || []).some((h) => h.status === 'interview'));
  const auto = submitted.filter((a) => a.captureMethod === 'auto-detected' || a.captureMethod === 'prompt');
  const weekAgo = Date.now() - 7 * DAY;
  const respTimes = responded
    .map((a) => {
      const h = (a.history || []).find((x) => ['interview', 'offer', 'rejected'].includes(x.status));
      return h && a.appliedAt ? (h.at - a.appliedAt) / DAY : null;
    })
    .filter((x) => x !== null && x >= 0);
  return {
    total: apps.length,
    submitted: submitted.length,
    thisWeek: submitted.filter((a) => (a.appliedAt || 0) > weekAgo).length,
    interviews: interviews.length,
    offers: apps.filter((a) => a.status === 'offer').length,
    responseRate: submitted.length ? responded.length / submitted.length : 0,
    interviewRate: submitted.length ? interviews.length / submitted.length : 0,
    autoRate: submitted.length ? auto.length / submitted.length : 0,
    avgDaysToResponse: respTimes.length ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : null,
    followUps: apps.filter((a) => isFollowUpDue(a, followUpDays)).length,
    preserved: apps.filter((a) => a.jd && a.jd.text).length,
  };
}

export function toCSV(apps) {
  const cols = [
    ['company', (a) => a.company],
    ['title', (a) => a.title],
    ['location', (a) => a.location],
    ['salary', (a) => a.salary],
    ['status', (a) => STATUS_LABEL[a.status] || a.status],
    ['source', (a) => a.source],
    ['capture_method', (a) => a.captureMethod],
    ['saved_on', (a) => (a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '')],
    ['applied_on', (a) => (a.appliedAt ? new Date(a.appliedAt).toISOString().slice(0, 10) : '')],
    ['last_update', (a) => (a.updatedAt ? new Date(a.updatedAt).toISOString().slice(0, 10) : '')],
    ['url', (a) => a.url],
    ['notes', (a) => a.notes],
    ['job_description', (a) => (a.jd ? a.jd.text : '')],
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [cols.map((c) => c[0]).join(',')];
  for (const a of apps) rows.push(cols.map((c) => esc(c[1](a))).join(','));
  return '﻿' + rows.join('\r\n');
}
