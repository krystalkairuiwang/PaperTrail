// PaperTrail job extraction — works on any page, in three layers:
//   1) schema.org JobPosting JSON-LD (used by most ATSs and career sites for Google Jobs)
//   2) known ATS layouts (Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, LinkedIn, Indeed, …)
//   3) generic heuristics (URL, headings, "Apply" buttons, requirements-style text) for everything else
(() => {
  if (window.__PT_extract) return;

  const ATS = [
    { name: 'Greenhouse', host: /(^|\.)greenhouse\.io$/, slug: 'path1', title: ['.app-title', '.job__title h1', 'h1.section-header', 'h1'], company: ['.company-name'], location: ['.location', '.job__location'], desc: ['#content', '.job__description', '.job-post'] },
    { name: 'Lever', host: /(^|\.)lever\.co$/, slug: 'path1', title: ['.posting-headline h2', 'h2'], location: ['.posting-categories .location', '.sort-by-location'], desc: ['[data-qa="job-description"]', '.section-wrapper.page-full-width', '.content'] },
    { name: 'Ashby', host: /(^|\.)ashbyhq\.com$/, slug: 'path1', title: ['h1'], location: ['[class*="location"]'], desc: ['[class*="descriptionText"]', '[class*="description"]'] },
    { name: 'Workday', host: /myworkdayjobs\.com$|myworkdaysite\.com$/, slug: 'sub1', title: ['[data-automation-id="jobPostingHeader"]', 'h2', 'h1'], location: ['[data-automation-id="locations"] dd', '[data-automation-id="locations"]'], desc: ['[data-automation-id="jobPostingDescription"]'] },
    { name: 'iCIMS', host: /(^|\.)icims\.com$/, slug: 'sub1', title: ['h1.iCIMS_Header', '.iCIMS_Header', 'h1'], desc: ['.iCIMS_JobContent', '.iCIMS_InfoMsg_Job'] },
    { name: 'SmartRecruiters', host: /smartrecruiters\.com$/, slug: 'path1', title: ['h1.job-title', 'h1'], company: ['[itemprop="hiringOrganization"] [itemprop="name"]'], location: ['[itemprop="jobLocation"]', '.job-detail'], desc: ['[itemprop="description"]', '.job-sections'] },
    { name: 'Workable', host: /(^|\.)workable\.com$/, slug: 'path1', title: ['h1'], location: ['[data-ui="job-location"]'], desc: ['[data-ui="job-description"]', 'main'] },
    { name: 'BambooHR', host: /bamboohr\.com$/, slug: 'sub1', title: ['h2', 'h1'], desc: ['.BambooRich', '[class*="jobDescription"]'] },
    { name: 'Taleo', host: /taleo\.net$/, slug: 'sub1', title: ['.titlepage', 'h1'], desc: ['.editablesection', '#requisitionDescriptionInterface'] },
    { name: 'SuccessFactors', host: /successfactors\.(com|eu)$|jobs\.sap\.com$/, slug: 'sub1', title: ['[data-careersite-propertyid="title"]', 'h1'], desc: ['.jobdescription', '[data-careersite-propertyid="description"]'] },
    { name: 'LinkedIn', host: /(^|\.)linkedin\.com$/, title: ['.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1'], company: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link'], location: ['.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.topcard__flavor--bullet'], desc: ['#job-details', '.jobs-description__content', '.show-more-less-html__markup'] },
    { name: 'Indeed', host: /(^|\.)indeed\.com$/, title: ['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title', 'h1'], company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name]'], location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'], desc: ['#jobDescriptionText'] },
    { name: 'Wellfound', host: /(^|\.)wellfound\.com$/, title: ['h1'], desc: ['[class*="description"]', 'main'] },
    { name: 'Glassdoor', host: /(^|\.)glassdoor\.com$/, title: ['[data-test="job-title"]', 'h1'], company: ['[data-test="employer-name"]'], desc: ['[class*="JobDetails_jobDescription"]', '[data-test="jobDescriptionContent"]'] },
  ];

  // Sites where automatic detection is switched off because it isn't reliable yet.
  // On these, PaperTrail shows no on-page card and never logs on its own; the popup still saves by hand.
  const MANUAL_ONLY = [
    { name: 'Handshake', host: /(^|\.)joinhandshake\.com$/ },
  ];
  const manualOnly = () => MANUAL_ONLY.find((m) => m.host.test(location.hostname)) || null;
  window.__PT_manualOnly = manualOnly;

  const JOB_WORDS = /\b(responsibilities|qualifications|requirements|what you('|’)ll do|about the role|about you|who you are|preferred|minimum qualifications|basic qualifications|benefits|equal opportunity employer|years of experience)\b/gi;
  const URL_WORDS = /(\/|\b)(jobs?|careers?|positions?|openings?|vacanc|requisition|postings?|opportunit|apply)\b/i;
  const APPLY_RE = /^\s*(apply( now| for this (job|position|role))?|easy apply|start (your )?application|i('|’)m interested)\s*$/i;

  const $ = (sel, root = document) => {
    try { return root.querySelector(sel); } catch { return null; }
  };
  const txt = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : '');
  const first = (sels = []) => {
    for (const s of sels) {
      const el = $(s);
      const t = txt(el);
      if (t) return { el, t };
    }
    return null;
  };
  const titleCase = (slug) =>
    (slug || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b(careers?|jobs?)\b/gi, '')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const htmlToText = (html) => {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html).replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, '$&\n');
    return (d.textContent || '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  };

  function jsonLdJob() {
    const out = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse(s.textContent);
        const walk = (n) => {
          if (!n || typeof n !== 'object') return;
          if (Array.isArray(n)) return n.forEach(walk);
          const t = n['@type'];
          if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) out.push(n);
          if (n['@graph']) walk(n['@graph']);
        };
        walk(data);
      } catch {}
    });
    const j = out[0];
    if (!j) return null;
    const org = j.hiringOrganization;
    const locs = [].concat(j.jobLocation || []).map((l) => {
      const a = (l && l.address) || {};
      return [a.addressLocality, a.addressRegion].filter(Boolean).join(', ') || a.addressCountry || '';
    }).filter(Boolean);
    let location = locs.join(' · ');
    if (/TELECOMMUTE/i.test(j.jobLocationType || '')) location = location ? location + ' · Remote' : 'Remote';
    let salary = '';
    const bs = j.baseSalary;
    if (bs && bs.value) {
      const v = bs.value;
      const cur = bs.currency === 'USD' || !bs.currency ? '$' : bs.currency + ' ';
      const f = (n) => (n >= 1000 ? cur + Math.round(n / 1000) + 'k' : cur + n);
      if (v.minValue && v.maxValue) salary = `${f(v.minValue)}–${f(v.maxValue)}`;
      else if (v.value) salary = f(v.value);
      if (salary && v.unitText && !/year/i.test(v.unitText)) salary += ' / ' + v.unitText.toLowerCase();
    }
    return {
      title: (j.title || '').trim(),
      company: (typeof org === 'string' ? org : org && org.name) || '',
      location,
      salary,
      description: htmlToText(j.description),
      datePosted: j.datePosted || '',
      validThrough: j.validThrough || '',
    };
  }

  function atsFor(host) {
    return ATS.find((a) => a.host.test(host)) || null;
  }

  function companyFromHost(ats) {
    const host = location.hostname;
    const parts = location.pathname.split('/').filter(Boolean);
    if (!ats || !ats.slug) return '';
    if (ats.slug === 'path1') {
      const p = parts[0] === 'embed' ? new URLSearchParams(location.search).get('for') : parts[0];
      return titleCase(p);
    }
    if (ats.slug === 'sub1') return titleCase(host.split('.')[0].replace(/^(careers|jobs)-/, ''));
    return '';
  }

  function genericCompany() {
    const meta = (n) => {
      const el = $(`meta[property="${n}"], meta[name="${n}"]`);
      return el ? (el.getAttribute('content') || '').trim() : '';
    };
    const site = meta('og:site_name') || meta('application-name');
    if (site) return site.replace(/\s*(careers?|jobs)\s*$/i, '').trim();
    const host = location.hostname.replace(/^(www|careers|jobs|apply|boards)\./, '');
    if (host) return titleCase(host.split('.')[0]);
    const m = document.title.split(/\s[|–—-]\s/);
    return m.length > 1 ? m[m.length - 1].trim() : '';
  }

  function genericTitle() {
    const h1s = [...document.querySelectorAll('h1')].map(txt).filter((t) => t && t.length < 140);
    if (h1s.length) return h1s[0];
    const og = $('meta[property="og:title"]');
    const t = (og && og.getAttribute('content')) || document.title;
    return (t || '').split(/\s[|–—-]\s/)[0].trim();
  }

  function genericDescription() {
    const candidates = [...document.querySelectorAll('main, article, section, [class*="description" i], [id*="description" i], [class*="job" i], [class*="posting" i], div')]
      .slice(0, 1500);
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (el.closest('#papertrail-root, nav, footer, header, form')) continue;
      const t = txt(el);
      if (t.length < 300 || t.length > 40000) continue;
      const hits = (t.match(JOB_WORDS) || []).length;
      // prefer the tightest element that still holds most of the job text
      const score = hits * 400 + Math.min(t.length, 6000) - Math.max(0, t.length - 9000) * 0.5 - el.querySelectorAll('a').length * 15;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best || '';
  }

  function findLine(label) {
    const re = new RegExp('^\\s*' + label + '\\s*[:\\-–]\\s*(.{2,80})$', 'im');
    const m = (document.body.innerText || '').slice(0, 20000).match(re);
    return m ? m[1].trim() : '';
  }

  // "Durham, NC · Full-time" style subtitles right under the title
  function locationNearTitle() {
    const h1 = $('h1');
    let el = h1 && h1.nextElementSibling;
    for (let i = 0; el && i < 3; i++, el = el.nextElementSibling) {
      const t = txt(el).slice(0, 200);
      const m = t.match(/\b([A-Z][a-zA-Z.\- ]{1,30}, [A-Z]{2})\b(\s*\((?:hybrid|remote|onsite|on-site)\))?|\bRemote\b/);
      if (m) return m[0];
    }
    return '';
  }

  function salaryFromText(t) {
    const m = (t || '').match(/\$\s?\d{2,3}(?:,\d{3}|k|K)(?:\.\d+)?\s*(?:[-–—]|to)\s*\$?\s?\d{2,3}(?:,\d{3}|k|K)(?:\.\d+)?/);
    if (!m) return '';
    return m[0].replace(/,000/g, 'k').replace(/\s+/g, '').replace(/to/, '–').replace(/-/, '–').replace(/K/g, 'k');
  }

  function hasApplyButton() {
    return [...document.querySelectorAll('a, button, input[type="submit"], [role="button"]')].slice(0, 600).some((b) => APPLY_RE.test(b.innerText || b.value || b.getAttribute('aria-label') || ''));
  }

  function extract() {
    const ats = atsFor(location.hostname);
    const ld = jsonLdJob();
    const signals = [];
    let score = 0;
    if (ld && ld.title) { score += 100; signals.push('schema.org JobPosting'); }
    if (ats) { score += 30; signals.push(ats.name + ' layout'); }
    if (URL_WORDS.test(location.pathname + location.search)) { score += 20; signals.push('job-like URL'); }
    const bodySample = (document.body ? document.body.innerText || '' : '').slice(0, 30000);
    const kw = new Set((bodySample.match(JOB_WORDS) || []).map((s) => s.toLowerCase())).size;
    if (kw >= 2) { score += 15 + Math.min(kw, 5) * 5; signals.push(`${kw} job-description keywords`); }
    if (hasApplyButton()) { score += 25; signals.push('Apply button'); }

    const sel = ats || {};
    const title = (ld && ld.title) || (first(sel.title) || {}).t || genericTitle();
    const company = (ld && ld.company) || (first(sel.company) || {}).t || companyFromHost(ats) || genericCompany();
    let description = (first(sel.desc) || {}).t || '';
    if (ld && ld.description && ld.description.length > description.length * 0.6) description = ld.description;
    if (description.length < 200) description = genericDescription() || description;
    const location_ = (ld && ld.location) || (first(sel.location) || {}).t || (findLine('location').split(/\s[·|•]\s/)[0] || locationNearTitle());
    const salary = (ld && ld.salary) || salaryFromText(description) || salaryFromText(bodySample.slice(0, 8000));

    const manual = manualOnly();
    return {
      title: (title || '').replace(/\s+/g, ' ').slice(0, 160),
      // on manual-only sites the generic guess would be the site's own name, so leave it for the user
      company: manual && !(ld && ld.company) ? '' : (company || '').replace(/\s+/g, ' ').slice(0, 100),
      location: (location_ || '').replace(/\s+/g, ' ').slice(0, 120),
      salary,
      description: description.slice(0, 40000),
      url: location.href,
      source: manual ? manual.name : ats ? ats.name : 'Company site',
      score,
      isJob: !manual && score >= 60,
      manualOnly: manual ? manual.name : null,
      signals,
    };
  }

  window.__PT_extract = extract;
})();
