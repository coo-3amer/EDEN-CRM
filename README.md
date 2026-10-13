# EDEN CRM

Lead and sales CRM for EDEN Developments, built on Google Apps Script with a Google Sheet as the database.

> Step-by-step setup in Egyptian Arabic: **SETUP-AR.md**

## What it does

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

## Files

```
src/                    the CRM (company accounts only)
intake/                 small project that receives the website form (public)
website-snippet.html    form code for the website
```

## Updating from v1
1. `npx clasp push -f`
2. Run `setup()` once from the editor and approve the new Calendar permission. It adds the new sheets (Units, Tasks) and columns, and moves any unit codes typed into Projects into the inventory.
3. Deploy → Manage deployments → Edit → New version → Deploy.

## Limits
- Google Sheets is comfortable up to tens of thousands of leads.
- MailApp sends about 1,500 emails a day on Workspace.
- Meta leads arrive within 10 minutes, not instantly (polling, not webhooks).
- Excel export is a UTF-8 CSV, which Excel opens with Arabic names intact.
