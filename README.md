# EDEN CRM

Lead and sales CRM for EDEN Developments, built on Google Apps Script with a Google Sheet as the database.

> Live at **https://crm.edenalkhalij.com** · setup in Egyptian Arabic: **SETUP-AR.md**

## What it does

**Home dashboard** — month-to-date KPIs vs last month with sparklines, monthly targets with pace markers,
new leads per day, open pipeline, lead sources, leaderboard, tasks due, "needs attention" list,
recent team activity and an inventory snapshot. Managers can switch between the whole team and one agent.

**Client profile** — tabs for Overview, Details (contact, interest, nationality, occupation, payment,
purpose…), Activity timeline, Files (stored in Google Drive, up to 10 MB each) and Deals (every deal with
the same client, lifetime value, open a new deal).

**Calendar, notifications, targets** — month calendar of tasks and follow-ups, in-app notification bell,
monthly targets per agent (sales value, deals, site visits). Sidebar layout with light and dark themes.

**Leads and pipeline**
- Pipeline board with drag and drop (New → Contacted → Qualified → Site visit → Negotiation → Won / Lost)
- Lead rating (Hot / Warm / Cold), tags, search, filters, sorting
- Full activity history per lead: calls, WhatsApp, visits, meetings, notes, stage changes, assignments, unit reservations
- Duplicate protection: a returning number is logged on the existing lead and its agent is told

**Team and permissions** (enforced on the server)
- Sales see only their own leads and tasks
- Managers see everything, assign (one by one or in bulk), import leads, manage inventory and templates
- Admin manages the team, automations, Meta and website settings
- The data sheet is never shared with sales

**Lead sources**
- Manual entry, CSV import
- Meta Lead Ads pulled every 10 minutes
- Website form through the separate Intake project
- Auto-assignment to the agent with the fewest open leads

**Unit inventory and reservations**
- Units per project with type, floor, area, price, currency, status (Available / Reserved / Sold / Blocked)
- Reserve a unit for a client for N days; double booking is blocked
- Expired reservations free the unit automatically and email the agent and managers
- Marking a lead Won sells its unit and uses the unit price as the deal value
- Marking a lead Lost releases its unit
- Bulk import from Excel / CSV, export to Excel

**Tasks and calendar**
- Tasks with date and time: call, WhatsApp, site visit, meeting, to-do
- Site visits and meetings go on the shared "EDEN CRM — Visits & Meetings" Google Calendar with the agent invited
- Email reminder before each task is due
- Completing a call / visit task logs it as contact on the lead
- A Today view: overdue and today's tasks, uncontacted new leads, overdue follow-ups

**WhatsApp**
- One-click templates with placeholders ({name}, {agent}, {project}, {unit}, {price}, {visit})
- Opening a template pre-fills the activity log

**Automations**
- First-contact alert (default 2 h) and automatic reassignment (default 24 h)
- Morning email for every agent with their day, and a summary for managers with yesterday's activity
- Email to managers on every sale and every new reservation

**Reports and export**
- Leads by stage, source, rating, project, lost reasons; team performance and average first response
- Daily activity report per agent (calls, WhatsApp, visits, meetings, tasks done, sales) for today, yesterday, 7 / 30 days, this month
- Export leads, inventory and activity to Excel (CSV) or copy straight into Excel

## How it runs

```
apps-script/            server (Google Apps Script) — data in a Google Sheet, emails, calendar, triggers
web/                    the website at https://crm.edenalkhalij.com (GitHub Pages)
tests/                  server tests on a mocked Apps Script runtime (run on every push)
.github/workflows/      test → push to Apps Script → publish the site, on every push to main
website-snippet.html    lead form for the company website
```

- Sign-in: the user enters their work email and gets a 6-digit code by email (valid 10 minutes, 5 tries),
  or uses "Sign in with Google" when `GOOGLE_CLIENT_ID` is set. Only people listed and active in
  Settings → Team can sign in. The server then issues a signed 12-hour session, and every action
  re-checks the user's role.
- The Apps Script web app is deployed "Execute as me / Anyone" so the site can call it without Google
  cookies; nothing is readable without a valid session.
- GitHub Actions pushes `apps-script/` through the Apps Script API (no clasp needed), keeps one
  deployment ("EDEN CRM API") so the API URL never changes, and writes the API URL into `web/config.js`.

Setup steps (Egyptian Arabic): **SETUP-AR.md**. Required repo settings:
`CLASPRC_JSON` (secret), `SCRIPT_ID` (variable), optional `GOOGLE_CLIENT_ID` (variable), Pages source = GitHub Actions.

## Limits
- Google Sheets is comfortable up to tens of thousands of leads.
- MailApp sends about 1,500 emails a day on Workspace.
- Meta leads arrive within 10 minutes, not instantly (polling, not webhooks).
- Apps Script allows a limited number of saved versions per project; the deploy only creates a version when the server code actually changed.
- Excel export is a UTF-8 CSV, which Excel opens with Arabic names intact.
