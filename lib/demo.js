// Fictional demo data so the tracker looks lived-in for a pitch or class demo.
import { uid, canonicalUrl } from './store.js';

const DAY = 86400000;

const ROWS = [
  // company, title, location, salary, source, status, appliedDaysAgo (null = not applied), method, extra
  ['Brightline Retail Analytics', 'Business Analyst', 'Durham, NC', '$78k–$92k', 'Greenhouse', 'applied', 3, 'auto-detected'],
  ['Sterling & Vale Consulting', 'Associate Consultant, Analytics', 'Charlotte, NC', '$95k–$110k', 'Company site', 'interview', 16, 'auto-detected', { interviewAfter: 6, notes: 'Case interview round 2 on Thursday. Prep a market-sizing case and the pricing case from class.' }],
  ['Bluegrass Capital', 'Data Analyst, Credit Risk', 'New York, NY', '$90k–$105k', 'Workday', 'applied', 14, 'auto-detected'],
  ['Lumen Health', 'Product Analyst', 'Remote', '$85k–$100k', 'Lever', 'rejected', 24, 'auto-detected', { rejectAfter: 9 }],
  ['Bayline Freight', 'Operations Analytics Associate', 'Atlanta, GA', '', 'iCIMS', 'applied', 12, 'auto-detected'],
  ['Atlas Payments', 'Strategy & Analytics Associate', 'New York, NY', '$110k–$125k', 'Ashby', 'interview', 20, 'auto-detected', { interviewAfter: 8, notes: 'Recruiter screen went well. Next is the SQL take-home, due Monday.' }],
  ['Kestrel Retail Group', 'Pricing Analyst', 'Chicago, IL', '$88k–$98k', 'Workday', 'offer', 33, 'auto-detected', { interviewAfter: 7, offerAfter: 22, notes: 'Offer: base plus a 10% bonus. Reply needed by the 26th.' }],
  ['Meridian Insurance', 'Decision Scientist I', 'Raleigh, NC', '$92k–$108k', 'SmartRecruiters', 'applied', 5, 'prompt'],
  ['Tidewater Energy', 'Market Analyst', 'Houston, TX', '', 'Company site', 'saved', null, 'one-click'],
  ['Quarry Labs', 'Analytics Engineer', 'Remote', '$105k–$130k', 'Greenhouse', 'saved', null, 'one-click'],
  ['Solstice Media', 'Marketing Analytics Associate', 'Los Angeles, CA', '$80k–$95k', 'Lever', 'rejected', 29, 'auto-detected', { rejectAfter: 4 }],
  ['Pinecrest Bank', 'Business Intelligence Analyst', 'Charlotte, NC', '', 'Taleo', 'applied', 18, 'auto-detected', { followedUpDaysAgo: null }],
  ['Orchard Robotics', 'Business Operations Analyst', 'Boston, MA', '$95k–$115k', 'Ashby', 'interview', 11, 'auto-detected', { interviewAfter: 5 }],
  ['Ridgeline Partners', 'Economic Consulting Analyst', 'Washington, DC', '$90k–$100k', 'Greenhouse', 'applied', 2, 'auto-detected', { notes: 'Referral from a former CRA colleague. Mention antitrust and merger work.' }],
  ['Fable & Finch', 'Growth Analyst', 'Remote', '$82k–$96k', 'LinkedIn', 'applied', 8, 'one-click'],
  ['Granite Logistics', 'Supply Chain Analyst', 'Nashville, TN', '', 'Workday', 'rejected', 38, 'auto-detected', { rejectAfter: 15 }],
  ['Copperline Health', 'Healthcare Data Analyst', 'Durham, NC', '', 'iCIMS', 'saved', null, 'one-click'],
  ['Vantage Sports', 'Revenue Strategy Analyst', 'Remote', '$75k–$90k', 'Greenhouse', 'applied', 1, 'auto-detected'],
  ['Larkspur Bio', 'Commercial Analytics Associate', 'Research Triangle Park, NC', '$88k–$102k', 'Workday', 'applied', 9, 'auto-detected', { followedUpDaysAgo: 2 }],
];

const SLUG = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const URLS = {
  Greenhouse: (c, n) => `https://job-boards.greenhouse.io/${SLUG(c)}/jobs/${n}`,
  Lever: (c, n) => `https://jobs.lever.co/${SLUG(c)}/${n.toString(16)}-4c1e-9a7b-${n}`,
  Ashby: (c, n) => `https://jobs.ashbyhq.com/${SLUG(c)}/${n.toString(16)}-a1b2`,
  Workday: (c, n) => `https://${SLUG(c)}.wd5.myworkdayjobs.com/en-US/Careers/job/R-${n}`,
  iCIMS: (c, n) => `https://careers-${SLUG(c)}.icims.com/jobs/${n}/job`,
  SmartRecruiters: (c, n) => `https://jobs.smartrecruiters.com/${SLUG(c)}/${n}`,
  Taleo: (c, n) => `https://${SLUG(c)}.taleo.net/careersection/2/jobdetail.ftl?job=${n}`,
  LinkedIn: (c, n) => `https://www.linkedin.com/jobs/view/${n}`,
  'Company site': (c, n) => `https://careers.${SLUG(c)}.com/openings/${n}`,
};

function jd(company, title, location, salary) {
  const focus = /pricing|revenue/i.test(title) ? 'pricing and revenue' : /risk|credit|bank/i.test(title + company) ? 'credit risk and portfolio performance' : /operations|supply|freight|logistics/i.test(title + company) ? 'operations and supply chain' : /marketing|growth/i.test(title) ? 'marketing and customer growth' : /consult/i.test(title + company) ? 'client engagements across industries' : 'product and business performance';
  return `About ${company}
${company} is a growing team that uses data to make better decisions about ${focus}. We're hiring a ${title} to join our team in ${location}.

What you'll do
• Own recurring analyses and dashboards that leadership uses to track ${focus}
• Write SQL and Python to pull, clean, and model data from our warehouse
• Frame ambiguous business questions, run the analysis, and present recommendations to stakeholders
• Design and evaluate experiments and pilot programs, quantifying impact and trade-offs
• Partner with finance, product, and operations teams on planning and forecasting

Qualifications
• Bachelor's or Master's degree in Business Analytics, Economics, Statistics, or a related field
• 1–3 years of experience in analytics, consulting, or a quantitative role
• Strong SQL; working knowledge of Python or R; comfort with Excel modeling
• Experience communicating findings to non-technical audiences
• Preferred: familiarity with Tableau or Power BI, regression and causal inference methods

Compensation & benefits
${salary ? `The expected base salary range for this role is ${salary.replace('–', ' – ')}.` : 'Competitive base salary and annual bonus.'} Health, dental and vision coverage, 401(k) match, and a learning stipend.

${company} is an equal opportunity employer.`;
}

const CONFIRM_TEXT = {
  Greenhouse: ['Submit application', 'Thank you for applying.'],
  Lever: ['Submit application', 'Application submitted!'],
  Ashby: ['Submit Application', 'Your application was successfully submitted.'],
  Workday: ['Submit', 'Application Submitted'],
  iCIMS: ['Submit', 'Thank you for your application'],
  SmartRecruiters: ['Send', "We've received your application"],
  Taleo: ['Submit', 'Your application has been submitted'],
  'Company site': ['Submit application', "We've received your application"],
};
const POSTING_SIGNALS = {
  Greenhouse: 'schema.org JobPosting, Greenhouse layout, Apply button',
  Lever: 'schema.org JobPosting, Lever layout, job-like URL',
  Ashby: 'schema.org JobPosting, Ashby layout, job-like URL',
  Workday: 'schema.org JobPosting, Workday layout, job-like URL',
  iCIMS: 'iCIMS layout, job-like URL, 5 job-description keywords',
  Taleo: 'Taleo layout, job-like URL, Apply button',
  'Company site': 'job-like URL, 5 job-description keywords, Apply button',
};
function demoDetection(source, method, i) {
  const [btn, msg] = CONFIRM_TEXT[source] || CONFIRM_TEXT['Company site'];
  const posting = 'Posting recognized from ' + (POSTING_SIGNALS[source] || POSTING_SIGNALS['Company site']);
  if (method === 'auto-detected') {
    return { method, reasons: [`You clicked "${btn}" (${(i % 3) ? 'seconds earlier' : '1 min earlier'})`, `Confirmation message on the page: "${msg}"`, posting] };
  }
  if (method === 'prompt') {
    return { method, reasons: [`You clicked "${btn}" (seconds earlier)`, 'No confirmation message was found on the page', 'You confirmed it with "Yes, log it"', posting] };
  }
  return { method, reasons: ['You logged it yourself with "I applied"', posting] };
}

export function buildDemoApps() {
  const now = Date.now();
  return ROWS.map((r, i) => {
    const [company, title, location, salary, source, status, appliedAgo, method, x = {}] = r;
    const n = 4800000 + i * 7919;
    const url = (URLS[source] || URLS['Company site'])(company, n);
    const appliedAt = appliedAgo != null ? now - appliedAgo * DAY - (i % 5) * 3600000 : null;
    const createdAt = appliedAt ? appliedAt - (i % 3) * DAY - 2 * 3600000 : now - ((i % 6) + 1) * DAY;
    const history = [{ status: 'saved', at: createdAt, via: method }];
    if (appliedAt) history.push({ status: 'applied', at: appliedAt, via: method });
    if (x.interviewAfter) history.push({ status: 'interview', at: appliedAt + x.interviewAfter * DAY, via: 'manual' });
    if (x.offerAfter) history.push({ status: 'offer', at: appliedAt + x.offerAfter * DAY, via: 'manual' });
    if (x.rejectAfter) history.push({ status: 'rejected', at: appliedAt + x.rejectAfter * DAY, via: 'manual' });
    const text = jd(company, title, location, salary);
    return {
      id: uid(),
      title,
      company,
      location,
      salary,
      url,
      canonicalUrl: canonicalUrl(url),
      source,
      status,
      captureMethod: method,
      createdAt,
      appliedAt,
      updatedAt: history[history.length - 1].at,
      followedUpAt: x.followedUpDaysAgo != null ? now - x.followedUpDaysAgo * DAY : null,
      notes: x.notes || '',
      history,
      jd: { text, words: text.split(/\s+/).length, capturedAt: createdAt, fromUrl: url },
      detection: appliedAt ? { ...demoDetection(source, method, i), at: appliedAt } : null,
      demo: true,
    };
  });
}
