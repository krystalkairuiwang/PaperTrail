# PaperTrail: job application tracker (prototype)

**Logs your applications on any job site the moment you apply, and keeps a copy of the job description after the posting is taken down.**
No account. No inbox access. Everything stays in your browser.

## Install (about 1 minute)
1. Unzip this folder somewhere you'll keep it, such as Documents.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `papertrail` folder (the one that contains `manifest.json`).
4. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to PaperTrail.
5. **For the local demo pages only:** on `chrome://extensions`, open PaperTrail's **Details** and turn on **Allow access to file URLs**.

The tracker opens in a new tab when you install. Choose **Load demo data** to fill it with about 19 fictional applications.

## Demo script (about 3 minutes)
1. **Show the problem.** Prowl only learns about an application when a confirmation email arrives, and it needs your inbox. Simplify logs an application only when its Copilot detects a supported submission, and it needs an account. Neither keeps the posting, and postings come down about when interviews start.
2. **Open `demo/index.html`.** Drag the file into Chrome.
3. **Demo 1 (Northwind, ATS-style).** A card appears in the corner with the role, company, location and salary. Click **Submit application**. The "Thank you for applying!" page loads, and a toast with an APPLIED stamp shows the application was logged automatically.
4. **Demo 2 (Harbor & Pine, any company site).** This page has no structured data and no known ATS, and it is still detected. Click **Apply now**, then **Submit application**. The confirmation appears without a new page load, and the application is logged.
5. **Demo 3 (Cardinal Freight, Workday-style).** Go through Apply, then Save and Continue, then Submit. The card stays through each step, and the application is logged at the end. Open **Why this was logged** on the toast to show the evidence.
6. **Demo 4 (Quill & Co., no clear confirmation).** Apply now, then Submit. The site only says "All set!", so after about 6 seconds PaperTrail asks **Did you just apply?** Click **Yes, log it**.
7. **Open the tracker** (toolbar icon, then Tracker ↗):
   - KPIs: response rate, interview rate, and share logged automatically
   - Follow-up nudge: applications with no update for 10+ days, also shown as the badge on the toolbar icon
   - Drag a card from Applied to Interviewing
   - Click a card to see **why it was logged** and the **saved job description** you can still read after the posting is gone
   - Search "Snowflake" to find the posting that mentioned it
   - Export CSV
8. **Try a real posting.** Any Greenhouse, Lever, Ashby, or Workday job page works the same way.

## How detection works
| Layer | What it reads | Covers |
|---|---|---|
| 1. Structured data | schema.org `JobPosting` JSON-LD, which ATSs publish for Google Jobs | Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, most company sites |
| 2. Known ATS layouts | Page selectors for 14 platforms | Workday, iCIMS, Taleo, LinkedIn, Indeed, Glassdoor, … |
| 3. Generic heuristics | Job-like URL, "Responsibilities/Qualifications" text, Apply button, `og:site_name` | Any careers page |

**Submission detection:** PaperTrail notes when you click Submit on an application form. If a confirmation message ("Thank you for applying", "Application submitted", "We've received your application") appears within 45 minutes in the same tab, even on another page or without a page load, it logs the posting you were on as **Applied**. A confirmation without a Submit click counts only when the URL also looks like a confirmation page.

**When it isn't sure:** if you clicked Submit but no recognizable confirmation appears within about 6 seconds (or on the next page), PaperTrail asks **Did you just apply?** instead of guessing. It only asks when the posting was seen in that tab within the past hour.

**Why it was logged:** every application logged at submit records its evidence: the Submit click, the confirmation text, a confirmation-style URL, and the signals that identified the posting. This appears under **Why this was logged** on the toast and in the tracker's detail panel.

**Handshake:** automatic detection is off on Handshake for now, because it wasn't reliable there. No card appears and nothing is logged on its own. Save Handshake postings from the toolbar popup (*Save for later* / *I applied*) or by right-clicking.

**Fallbacks:** You can log any page by hand with the popup (*Save for later* / *I applied*) or by right-clicking it (*PaperTrail: save this job*). If the job description wasn't picked up, highlight it, right-click, and choose *save selection as the job description*.

## Files
```
manifest.json         MV3 manifest
background.js         service worker: per-tab job context, submission logic, badge, context menus
content/              extract.js (detection), content.js (submit/confirm watching, on-page card + toast)
popup/                toolbar popup
dashboard/            full tracker: board, table, drawer, KPIs, CSV export, settings
lib/store.js          storage layer (chrome.storage.local), stats, CSV
lib/demo.js           fictional demo data
demo/                 four mock employer sites for live demos
```

## Prototype limits
- Data lives in one browser profile. There is no sync across devices yet; export to CSV to move it.
- Confirmation detection is heuristic. Undo is in the toast, and statuses can be changed anywhere.
- Statuses after Applied (interview, offer, rejection) are updated by hand. An optional inbox read for status changes would be the natural v2.
