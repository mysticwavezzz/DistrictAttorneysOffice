# DAO Website Final Overhaul — Planning Recommendations

**Prepared:** November 2, 2026
**Status:** Planning only. No tests, data changes, feature edits, or deployment were performed for this review.
**Purpose:** Reduce clutter, make the DA’s day-to-day work coherent, close workflow gaps, and prepare a deliberate release plan.

## 1. What this review covers

This is a product/workflow review of the current DAO portal, not a functional test report. I inspected the authenticated production views for the dashboard, case docket, work queue, review inbox, workload, supervisor reports, filing history, document creator, deadline calendar, staff intake, investigator intake, and public crime-tip page. I also reviewed the corresponding local page and component structure. I did not click decision buttons, submit anything, change settings, exercise every form, run automated tests, or edit/deploy code.

The page and control inventory is broad, but this is not yet a claim that every branch or permission combination has been exercised. A later playtest should cover each workflow with disposable accounts and records in a local test environment.

## 2. Executive recommendation

The portal should be organized around **three work areas**:

1. **Work Queue** — everything waiting for a human action, ranked by court deadline, office deadline, age, and severity.
2. **Cases** — one searchable docket and one consistent workspace for each matter.
3. **Intake** — public tips, investigator submissions, case-opening requests, records requests, and contact requests, each routed to the correct reviewer.

Keep **People & Teams**, **Reports**, **Templates**, and **Administration** as secondary work areas. Remove duplicate dashboard panels and repeated actions once the queue and case workspace become authoritative. Keep the public website clearly separate from staff operations.

The largest workflow gap I found is the crime-tip path: the public tip form says it forwards information to investigators and is hosted by Google Forms, while the DAO Review Inbox’s live queue categories do not include public crime tips. Investigators have a separate portal intake ticket, but a public tip does not appear to have that same first-class, trackable review path. The overhaul should make tips visible to authorized staff inside a controlled triage queue, with privacy boundaries, ownership, and a clear receipt/status flow.

## 3. Current product shape and sources of clutter

The portal already has many useful capabilities: case assignment, filings and approvals, initial case intake, investigator tickets, a workload view, a deadline calendar, readiness and handoff pages, a case workbench, notifications, roster/training, public contact forms, records requests, templates, reports, and developer administration.

The friction comes from how these capabilities are spread across many pages and repeated on several surfaces:

- The dashboard shows attention counts, a personal case view, and upcoming deadlines. Work Queue repeats unread alerts, intake, pending filings, and overdue deadlines. Supervisor Reports repeats unfiled, overdue, review, workload, case-review, and activity information.
- Review Inbox is a large mixed queue with tabs and filters for filings, AOPCs/reports, case requests, records requests, Contact Us, and investigator intake. Some items are reviewed there, while other items lead to a separate page or another workflow.
- The docket has filters, saved/search controls, bulk management, per-case details, recent-action expansions, and separate archive/ongoing views. Each card repeats fields that are also available on the case detail page.
- A case detail page exposes many destinations and actions: court filing status, file-a-document links, case tools, readiness, handoff, docket navigation, document creation, court filing/people/filings/deadlines/history/related anchors, a workbench, and case management. Some actions are repeated in different conditions. This creates decision load before the user even reaches the relevant case work.
- Readiness, handoff, and workbench are useful, but each is a separate destination from the case itself. The same person must remember which page owns a task, evidence reference, or hearing entry.
- “Approved for court filing” and “Filed in Court” are different events, but the UI directs staff from one to the other. The difference is operationally important and should be represented as one unmistakable lifecycle.
- The app has both in-app notifications and a Work Queue, while the dashboard and reports also surface work counts. Staff can see the same problem in several places without a single authoritative resolution state.
- The staff navigation shows a small set of primary tabs and hides other destinations under More. This helps fit the screen, but the large number of functions still makes it hard to predict where something lives.
- Public pages repeat section links, quick links, contact information, and site navigation. Staff pages also carry some public-facing footer links. This consumes space on working screens.

## 4. Proposed navigation

### Primary staff navigation

Keep the persistent staff navigation to five destinations:

1. **Work Queue** — replaces the default dashboard as the operational home.
2. **Cases** — replaces “My Cases” and the separate unassigned queue destination. Scope is controlled by a clear filter: Mine, My team, Unassigned, All accessible.
3. **Intake** — one front door for public tips, investigator tickets, case-opening requests, and other submissions. Only show queues the user is authorized to see.
4. **People** — roster, teams, onboarding status, and workload summary.
5. **More** — Reports, Calendar, Filings, Templates, Training/Orientation, Activity, and Settings, based on role permissions.

The current **Filing History** becomes a Cases → Filings view and remains directly reachable from More. **Document Creator** becomes a contextual action on a case and an optional standalone template library; it should not compete with case work in primary navigation.

### Public navigation

Keep public navigation focused on Home, Submit a Tip, Announcements, Contact, and Records Request. Put privacy, terms, office information, and the LE bulletin in a secondary/footer area. Remove repeated “This Section” and Quick Links blocks when the page already has the same navigation visible.

## 5. New DA work queue: one operational home

Make the DA’s default landing page a **single action list**, not three dashboards competing with each other.

### Queue sections

- **Due now / overdue:** court orders and hearing deadlines first; then internal office targets.
- **Needs my decision:** approvals, returns, case-opening decisions, investigator reports, tips needing assignment, and exceptions.
- **Needs my filing:** approved documents not yet marked filed with the court, plus cases with no initial filing record.
- **Needs an owner:** unassigned cases, unassigned tickets, attorney departures, conflict flags, and stalled handoffs.
- **Upcoming:** next seven days, collapsed by default.
- **Recently completed:** optional, short, and hidden by default.

### Queue behavior

- Every item has one owner, one next action, one due date or an explicit “No date set,” and one source link.
- Completion removes an item from the active queue but preserves it in the case timeline/audit history.
- Opening an item should take the user directly to the exact case, filing, tip, or ticket and highlight the action needed.
- A decision should update the originating queue item immediately. Do not leave a stale “needs review” count after the record was approved, returned, reassigned, or closed.
- Do not use “acknowledge” as a substitute for completion. Snoozing may defer a reminder, but cannot erase the deadline or change its owner.
- A queue card should show why it is here: “Court ordered, due 4:00 PM,” “Approved, not yet filed,” or “No attorney assigned.”
- Add a one-click “My next action” filter and a DA-level “All division work” filter.

### Dashboard content to remove or merge

- Remove duplicate deadline lists from Dashboard and Supervisor Reports after the Work Queue is authoritative.
- Keep headline totals only if selecting a total opens the matching filtered queue.
- Move analytics and trend charts to Reports.
- Keep a small “Office pulse” block with open matters, cases opened this week, filed this week, overdue court orders, and unresolved intake. Show definitions and the as-of time so the numbers are understandable.

## 6. Case docket redesign

### Docket list

Replace tall, repetitive case cards with a compact table/list that can switch to cards on mobile. Suggested columns:

| Column | Purpose |
|---|---|
| Case | DA tracking number, court action number, caption, and court status |
| Stage | Intake, charges filed, arraignment, pretrial, trial, disposition, closed |
| Attorney | Primary attorney and team; show unassigned clearly |
| Next action | A short action label, not a generic “needs attention” badge |
| Deadline | Date/time and whether it is court ordered or internal |
| Filing state | Draft, review, approved/not filed, filed, service/disclosure due |
| Updated | Last meaningful case event |

### Docket controls

- Keep one search box and a short filter row: case scope, stage, attorney/team, filing state, and deadline state.
- Put advanced filters and saved views inside one “More filters” control.
- Keep one bulk-action menu for authorized users. Show the number selected and explain the effect before applying.
- Replace separate “Ongoing/Pending” and “Archived” switches with a lifecycle filter: Open, Closed, Archived. Do not let archived records disappear from search.
- Provide standard saved views: My active cases, My team, Unassigned, Court deadlines this week, Initial filings not completed, Pending review, Awaiting disclosure, Recently updated.
- Add a clear reset-filters control and show active filters as removable chips.
- Do not offer “Open a Case” and “Propose a Case” as competing top-level calls to action. Use one “New matter” action with an explicit route based on permission and whether the record is a real case or a request.
- Keep the DA’s docket capable of viewing the whole office, but show personal/team scope by default if that matches the role’s daily work.

## 7. One consistent case workspace

Open a case into a stable workspace with a fixed identity header and four tabs:

1. **Overview** — caption, identifiers, owner/team, stage, next action, next deadline, court status, parties, and a short event summary.
2. **Filings & Evidence** — all draft/review/approved/filed documents, evidence/source register, disclosure state, and download links.
3. **Court & Deadlines** — hearings, orders, motions, service, response dates, and the source for each date.
4. **History & Handoff** — immutable activity, assignment transfers, completed tasks, and a one-page handoff summary.

### Case header actions

Show only the actions relevant to the current state, in this order:

- **Primary action:** the next legal/administrative step, such as “Submit initial filing for review,” “Mark filed in court,” “Prepare response,” or “Record disposition.”
- **Secondary action menu:** Add filing, add deadline/event, add evidence/source, assign/reassign, request review, close/archive.
- **Danger zone:** permanently delete only for exceptional admin use, isolated from ordinary actions and protected by a typed confirmation and recoverability warning.

Remove the current spread of competing links/buttons such as separate Case Tools, Court Readiness, Handoff Summary, My Cases, Create DA Document, and repeated File a Document buttons. Move those functions into the workspace tabs or the state-aware action menu. Ensure exactly one visible primary action for each state.

### Case summary and status integrity

- Store DA tracking number and court action number separately; never substitute one for the other.
- Show “Court status” and “Office workflow status” separately, with plain labels. A case may be assigned to a judge but not yet filed; the interface must not imply that one status proves the other.
- Show the source of each status change and the date it was verified.
- If the portal lacks a required fact, show “Unknown” or “Not recorded,” not a guessed status.
- Make an explicit duplicate/related-case relationship rather than creating a second case with ambiguous identity. Preserve both histories and let authorized staff choose duplicate, consolidated, related, or superseding.
- Add a “reconcile record” panel when court transcript and portal state differ. It should record the source and the person who reconciled it.

## 8. Filing lifecycle: remove ambiguity

Use a single visible status ladder:

**Draft → Submitted for DAO review → Returned or Approved → Filed with court → Served/Disclosed (when applicable) → Superseded or Withdrawn**

Store each event separately, with actor and timestamp. Approval is never equivalent to filing. “Filed with court” should require a deliberate button and preserve the actual court-filed date; if source/evidence is required by policy, make it a brief required field in the same action rather than a separate confusing workflow. For filings submitted by a person with authority to file directly, show the authorized route but keep the same audit events.

### Filing UI improvements

- Put the newest operative version at the top and label previous versions “Superseded,” “Returned,” or “Withdrawn.”
- Distinguish an initial charging document from later motions, notices, discovery, exhibits, and orders.
- Link every filing to its case and show the case caption in the filing detail itself.
- Include a pre-submit checklist tailored to the filing type: correct case/defendant, template, signature block, dates, action number, PDF opens, links work, page count, and no draft notes/placeholder text.
- Show the exact reason when returned and preserve the prior submitted copy for comparison.
- One “Download PDF” action, one “Open source document” action, one “Mark filed with court” action where authorized. Avoid duplicate buttons scattered across the page.
- When a new filing is attached, update the case page, filing history, case timeline, and queue from one event, not manual parallel edits.

## 9. Crime tips: a first-class review workflow

### Current gap

The live public tip page currently states that the form is hosted by Google Forms and that the portal cannot guarantee confidentiality or anonymity. The staff Review Inbox categories observed do not include crime tips. Investigator intake is a separate protected ticket flow. That means the public tip path lacks the same visible in-portal ownership, status, and review path as the investigator tickets.

### Recommended flow

1. **Public submission:** keep a short first step and a clear, honest privacy notice. Allow anonymous tips if operationally approved; make identity fields optional unless a specific follow-up is requested. Never promise confidentiality the system cannot provide.
2. **Receipt:** give a random reference number and a realistic notice that the tip line is not monitored for emergencies. Do not expose internal case information or reviewer names.
3. **Secure intake record:** save the submission to the DAO’s controlled intake store before sending it to any external service. If Google Forms remains as a backup, make it a controlled copy/notification route, not the only location of the evidence.
4. **Triage queue:** new queue item starts “Unreviewed.” Authorized investigator/intake staff can classify jurisdiction, urgency, crime category, evidence present, conflict concern, and whether it duplicates an existing tip/case.
5. **Assignment:** route by jurisdiction/division and workload, then assign a named reviewer. High-risk or leadership-conflict tips must route to a restricted independent reviewer set.
6. **Review outcomes:** Needs follow-up, Refer to agency, No jurisdiction, Insufficient detail, Duplicate, Open investigation, or Convert to case request. Record a short reason for closure.
7. **Follow-up:** provide a secure anonymous mailbox or one-time follow-up code if the system can support it. Do not require a public Discord DM or expose reporter information to every reviewer.
8. **Case conversion:** if opened as a case, retain the tip as a linked source record with restricted access. The case’s public-facing docket must not expose confidential reporter details.
9. **Audit and retention:** record every view, download, reassignment, status change, and export. Define retention/deletion limits and access roles before launch.

### Tip queue interface

- Default list shows only safe metadata: reference number, received time, urgency, category, jurisdiction, evidence indicator, assigned reviewer, age/SLA, and current status.
- Reporter identity and full narrative are behind an explicit access control; show a “sensitive details” reveal action and log it.
- Add filters for unread/new, urgent, unassigned, overdue, jurisdiction, assigned reviewer, and linked case.
- Provide a duplicate warning based on relevant identifiers and time/location, but never auto-merge or discard a tip.
- Acknowledge receipt automatically. A separate, human-reviewed response can tell the submitter that the tip was routed or closed, without disclosing investigative steps.
- Make the public tip form keyboard accessible, mobile-friendly, and resumable for long narratives. Add draft-save only if privacy/security design supports it.

## 10. Investigator and case-opening flow

The investigator intake form already distinguishes an AOPC from an investigative report and explains that an approved investigative report still needs a separate AOPC. Preserve that important distinction.

Recommended ticket path:

**Submitted → Received → Assigned for review → Follow-up requested / Returned → Approved as supporting material → Attorney case-opening review → Case opened or declined**

- Keep the investigator in the ticket, not in the attorney docket. The ticket should support clarification messages and additional attachments with a complete history.
- After approval, require an attorney to decide whether to open a case. Approval of evidence is not approval of charges and must never silently create a filed case.
- Show the source ticket on the new case and every attachment on the ticket and case through one linked file record.
- When a report is approved, create a task for a separate AOPC only when the reviewer decides a case should proceed; avoid a generic reminder that creates phantom work for every report.
- Allow reopening a closed intake ticket only with a reason and history entry.
- Offer a “Send back to investigator” action distinct from “Decline report” and “Open case.”
- Make case assignment and charging approval distinct permissions. A staff member may open a case record without having authority to assign counsel or approve charging.

## 11. Notifications and activity

- Treat notifications as reminders, not as the authoritative work record. The underlying case/ticket/filer record owns the status.
- Separate **Unread**, **Read**, and **Archived**. Visiting a destination can mark the specific linked notification read; it should not silently mark unrelated notices.
- Add “Mark all read,” filter by type, archive selected, and a small notification preferences panel.
- Clicking a notification should open the exact item, then remove it from Unread when the destination has loaded successfully.
- Do not keep read items in the unread badge or active alert list. Keep them in history with their original destination and timestamp.
- Add deduplication keys so the same case event does not create a dashboard alert, work queue item, and separate notification that all require separate dismissal.
- Let users opt into in-app, email/Discord, or browser push only when those channels are actually configured and privacy-safe.
- The activity log should be append-only and distinct from notifications; it records what changed, by whom, when, and what record changed.

## 12. Deadlines, hearings, and court actions

- One deadline record should include type, due time/time zone, source (order/transcript/rule/office target), source link, responsible attorney, status, and completion evidence.
- Display court-ordered deadlines more prominently than internal targets, but show both. Do not silently convert one type into the other.
- Add a warning for missing source, ambiguous timezone, deadline without owner, or order with no task.
- Completing a deadline should request the completion action: filing linked, hearing held, response served, or other result. “Acknowledge” alone does not complete the duty.
- Keep snooze as a reminder setting only. Show the underlying date and the snooze history.
- Add a court-event timeline that relates hearing dates, orders, transcript statements, filings, and resulting tasks. One event can generate multiple tasks, but those tasks should link back to it.
- For new court orders/transcript entries, provide a concise “Create tasks from this order” flow, reviewed by an attorney before tasks become official.
- In the current calendar, keep date-type filters but simplify to “Court dates,” “Court deadlines,” and “Office targets”; add owner and case filters.

## 13. Workload, assignment, and handoff

- Put unassigned work and attorney workload into one **People & Teams** view; keep “Unassigned” as a saved queue in Cases.
- Show each attorney’s assigned cases, open tasks, upcoming court obligations, overdue internal work, leave/unavailability, training status, and last assignment change.
- Assignment recommendations should be explainable: case count, case complexity, current deadlines, division eligibility, conflicts, and availability. The DA makes final assignment; do not make an opaque auto-assignment final.
- Add a conflict-check step before assigning sensitive or related matters. Record who cleared it and when.
- When an attorney leaves or changes division, generate a handoff checklist with active cases, next deadlines, pending motions, discovery, witnesses, evidence links, and an incoming attorney. Reassignment is not complete until a receiving owner accepts or supervisor overrides with a record.
- Avoid using raw case count alone as workload. Count active work and deadlines with weights the DA can inspect and adjust.
- Create an assignment queue for “case has no attorney,” “attorney inactive,” “attorney changed role,” and “unaccepted handoff.”

## 14. Features to merge, demote, simplify, or retain

### Merge

- Dashboard + Work Queue + the action-focused parts of Supervisor Reports → **Work Queue**.
- My Cases + Unassigned Queue + all-office docket → **Cases** with scope filters and saved views.
- Case Readiness + Handoff + Workbench → one **case workspace** with tabs.
- Filing History + case filing lists → one filing system with list and case-specific views.
- Public tips + investigator tickets + AOPC/report review + case-opening requests → **Intake** with separate queues and permissions.
- Calendar tasks + case deadlines + work-queue deadline items → one deadline record shown in multiple views.
- Notification bell + notification history + the unread part of Work Queue → one coherent notification model; preserve work tasks as tasks.

### Demote or simplify

- Make Document Creator a contextual case action and searchable template library, not a primary navigation item.
- Keep activity log in More/Reports; show only meaningful changes in the case history.
- Move advanced filters, bulk editing, and export behind secondary controls.
- Move settings, maintenance, sync, analytics, and dangerous operations into a developer/admin center with role-specific pages.
- Reduce repeated Quick Links and Contact Us blocks on staff working pages.
- Keep readiness checklist collapsed until it has a real incomplete item; otherwise show a compact “Court-ready” summary.
- Keep handoff summaries available, but do not require a separate “handoff” page for a simple attorney reassignment.
- Keep weekly report generation but put its publication status and data range in Reports; do not duplicate the same data on the DA home screen.

### Remove or retire after migration

- Retire duplicate entry points that create the same filing or case action in different ways.
- Retire any dashboard count that does not navigate to a complete filtered list.
- Remove outdated or unused AI features and configuration UI as previously directed; retain historical audit records only where required for system integrity, and do not expose obsolete model controls as active settings.
- Remove any duplicate case notes/updates that do not belong in the immutable event history only through a controlled, audited cleanup plan. Do not silently erase historical records.
- Remove repeated page-level links where primary navigation already provides the same destination.
- Do not delete a feature merely because it has low use until its owner, data dependencies, and migration path are known.

## 15. UI system and interaction standards

- Use one page width, spacing scale, button hierarchy, form label style, focus ring, card/table density, heading hierarchy, and link color across the site.
- Reserve one solid primary button per page/section. Destructive actions use a separate danger style and confirmation. Secondary actions should be links or quiet buttons.
- Keep concise explanatory text near the control it explains; remove repeated paragraphs and overlong helper text.
- Make tables responsive; do not shrink text until it is hard to read. On narrow screens, convert rows to compact cards with the same priority fields.
- Every form needs labels, required indicators, inline errors, clear save/submit result, and a safe way to return without losing data.
- Keep controls visually grouped by workflow step; do not mix profile fields, permissions, group assignment, onboarding, and unrelated account data in one broad form.
- Use consistent words: “Filed with court” for actual court filing, “Approved for filing” for portal approval, “Submitted for DAO review” for review queue, “Returned for correction” for a returned document.
- Avoid color-only status meaning. Pair color with text/icon and ensure contrast.
- Preserve user’s chosen theme/text size and do not let visited-link purple override the portal palette.
- Provide a sticky case identity bar on long pages, but keep it short and do not repeat every action button in each section.

## 16. People, onboarding, and permissions

- Keep Criminal Division onboarding separate from general portal access. A Criminal Division employee may require orientation; other staff and the DA must not be routed into a training gate incorrectly.
- Model role, division, team, rank, access capabilities, and onboarding completion as separate data. A title change should not overwrite a manual permission exception; show which value is synced and which is locally overridden.
- The roster should have a compact list, profile page, and clear placement state: Not assigned, Group 1, Group 2, Supervisor, or other authorized group.
- Keep orientation acknowledgement and training completion as explicit recorded events with version/date. A new orientation version should require acknowledgement only from the appropriate group.
- Make permissions explainable: “Can view,” “Can submit,” “Can approve,” “Can assign,” “Can file with court,” and “Can administer.” Avoid broad, ambiguous staff-admin controls.
- Prevent a user from approving their own submission when policy requires independent review.
- Add a permission preview (“What this person can see/do”) before saving roster changes.

## 17. Reports and public transparency

- Make the weekly public report a controlled publication generated from verified portal events, not raw live data. It should show a date range, definitions, and last-updated time.
- Separate counts for tips received, cases opened, charges filed, court filings, resolutions, and pending matters. Do not conflate an intake report with a charged case or an approved filing with a filed court document.
- Exclude confidential tip details, witness identities, sealed materials, juvenile/private matters if applicable, and nonpublic investigative information.
- Provide a staff preview and a sign-off step before publication. The DA or authorized designee is the publisher.
- Keep a correction log and allow the public report to be superseded without rewriting prior versions silently.
- Put internal metrics (case aging, workload, missed targets) in staff Reports; public transparency should not expose active investigative details.

## 18. Administration and developer settings

- Split the current admin surface into named pages: Identity & permissions, Divisions & ranks, Intake routing, Public site, Notifications, Data retention, Backups, Feature flags, and Audit log.
- Replace giant JSON editing with structured forms wherever possible. For advanced JSON, show schema validation, diff preview, backup, and rollback.
- Changes to role mapping, access, tip routing, retention, or deletion must show affected users/data before save and be recorded in an immutable admin log.
- Local automation must remain private to the developer profile and must not appear in public navigation or a normal staff menu.
- Include a current deployment/version display and a read-only health panel showing database, file storage, external form forwarding, and last backup status.
- Provide a maintenance-mode preview and status banner so users can tell whether the site or just one subsystem is unavailable.

## 19. Search and records

- Add a global staff search for case number, caption, attorney, investigator, filing title, intake reference, and court action number. Respect permissions in search results and snippets.
- Search results should be grouped by Cases, Filings, Intake, People, and Reports; show why each result matched.
- Allow case-level search within filings, evidence, events, and notes.
- Index public tips using a protected reference/metadata index, never put raw tip narrative into general search.
- Add duplicate detection before case creation: exact caption/identifier, source report number, and likely same incident. Show candidates and require a human disposition.
- Keep records requests in their own limited-access workflow, but route their deadlines and response tasks into Work Queue.

## 20. Notifications and communications

- Keep Contact Us, public records requests, investigator follow-ups, and anonymous tip follow-ups as distinct message types with appropriate access rules.
- Give each conversation an owner, status, response deadline, participant list, and linked case/intake record.
- Add templates for receipt, clarification request, referral, and closure, with human review before sending sensitive or case-specific content.
- Do not mix public messages with court filings or case notes. A public inquiry should not automatically become a case fact.
- Keep Discord references as external source links; do not assume a Discord message is a court filing unless recorded as such in the docket.

## 21. Candidate workflow map for later full playtest

This is the test plan to use **after** the product direction is approved. It has not been run.

| Workflow | Roles to cover | Expected checkpoints |
|---|---|---|
| Public crime tip | Anonymous reporter, identified reporter, investigator reviewer | Validation, receipt, secure queue, assignment, follow-up, closure, privacy access |
| Investigator AOPC | Investigator, reviewer, attorney | Submit, return, approve, open case, attach source, separate court filing state |
| Investigator report | Investigator, reviewer, attorney | Submit report, approve evidence, create separate AOPC task only when appropriate, case opening |
| New case | Attorney, supervisor, DA | Duplicate check, identifiers, CI attach, assignment permissions, review/approval, court-filed event |
| Subsequent filing | Attorney, reviewer, DA | Draft, upload, review, approval/return, actual court filing, versioning, case history |
| Court order and deadline | Attorney, supervisor | Add source, date/time zone, owner, queue alert, completion proof, overdue escalation |
| Case reassignment | Departing attorney, receiving attorney, supervisor | Handoff checklist, conflict check, acceptance, ownership update, history |
| Case closure/archive | Attorney, DA | Disposition, pending tasks warning, duplicate/related state, searchable archive |
| Notifications | All staff roles | New alert, visit target, mark read, mark all read, archive, deep link, no duplicate count |
| Roster/onboarding | DA, supervisor, new Criminal Division employee, non-criminal employee | Sync, manual overrides, group placement, orientation gate, permission preview |
| Records/contact requests | Public, intake reviewer, records staff | Receipt, SLA, assignment, response, closure, restricted access |
| Public weekly report | DA/publisher, public visitor | Data definitions, preview, sign-off, publication, correction/version history |
| Admin/configuration | Developer/admin only | Validation, diff, backup, role access, audit, rollback, maintenance state |

For each path, test permitted and denied roles, empty state, errors, slow connections, duplicate submit, refresh/back navigation, mobile width, keyboard/screen reader flow, persistence, notification effects, and audit history. Use synthetic or explicitly disposable data only; do not create fake records in production.

## 22. Release sequencing

### Phase 0 — Product decisions and data map

- Approve the navigation model, queue ownership, case lifecycle terms, tip privacy policy, and case/tip retention rules.
- List all current data objects and identify which pages read/write them.
- Decide whether Google Forms stays, becomes a backup, or is retired. Do not switch the public tip data path before this decision and privacy review.
- Define permissions for public tips, investigator intake, attorney case work, review, filing, assignment, and admin configuration.

### Phase 1 — Design system and navigation shell

- Unify spacing, typography, buttons, links, forms, status badges, and responsive behavior.
- Introduce the new navigation and role-specific home, without removing old routes yet.
- Add feature flags and route aliases so old bookmarks continue to work during migration.

### Phase 2 — Work Queue and case workspace

- Build the authoritative queue from existing deadlines, review items, and filings.
- Consolidate docket filters and implement the case workspace.
- Migrate Readiness, Handoff, and Workbench into the case workspace while retaining old URLs as redirects.
- Normalize filing event states and build reconciliation tools for mismatched case records.

### Phase 3 — Intake and tips

- Add a secure public tip record and restricted reviewer queue.
- Link tip records to investigator tickets and cases without exposing sensitive fields.
- Add audit, assignment, follow-up, and retention controls before public launch.

### Phase 4 — People, reports, and admin cleanup

- Consolidate workload, unassigned work, handoffs, and onboarding in People & Teams.
- Move metrics to Reports and publish weekly report through preview/sign-off.
- Replace giant admin configuration with validated, segmented forms and backups.

### Phase 5 — Local playtest, data migration, staged release

- Run the workflow matrix above in a local test environment.
- Migrate existing records with a preview report and reconciliation list.
- Take screenshots of every redesigned workflow at desktop and mobile widths.
- Run permission checks and confirm no public/private data boundary changed unintentionally.
- Deploy behind feature flags, watch health and error logs, then roll out by role.
- Keep rollback scripts and the old routes until the new workflow is stable.

## 23. Release acceptance criteria

The overhaul is ready for release only when:

- A DA can identify urgent matters and take the next action from one work queue.
- An attorney can open a case, understand its status, access filings/evidence, and record its next step without searching multiple sections.
- A case can never appear “filed in court” solely because a document was approved in the portal.
- Each court deadline has a source, owner, date/time, and completion status or is explicitly marked incomplete.
- Every public crime tip reaches an authorized, owned queue; receipt and privacy wording match the actual storage/access design.
- Investigator report approval does not silently become an AOPC, charge, or court filing.
- Reassignment transfers pending work and preserves who did what and when.
- Notifications, queue counts, and underlying records agree after every action.
- A public weekly report contains only approved, nonconfidential data and shows its reporting range and definitions.
- Role access, onboarding gates, and developer-only settings work for the DA, Criminal Division staff, investigators, public users, and administrators.
- All migration, rollback, and audit records are verified before old features/routes are retired.

## 24. Immediate design decisions to settle before implementation

1. Should the DA’s first screen be Work Queue, with a small office pulse summary above it? Recommendation: yes.
2. Should tips be stored in the DAO portal as the system of record? Recommendation: yes, if privacy, retention, and access controls are implemented first.
3. Should all staff use one case workspace, with role-specific actions? Recommendation: yes.
4. Should case and filing lifecycle events be immutable and corrected by superseding events? Recommendation: yes.
5. Should approval and court filing remain separate? Recommendation: yes; they describe different actions.
6. Should a report be approved directly into a criminal case? Recommendation: no; require an attorney case-opening decision and a separate AOPC.
7. Should auto-assignment be final? Recommendation: no; show an explainable recommendation and require authorized confirmation.
8. Should we delete or hide historical audit entries for removed features? Recommendation: no; remove active controls but retain legitimate history with a clear label.
9. Should AI be part of the overhaul? Recommendation: no. The current plan does not add AI tools or AI-based evidence review.

## 25. Bottom line

The product should stop behaving like a collection of separately built pages and behave like one office workflow: **intake enters a controlled queue, a human decides what becomes a case, the case owns its filings/evidence/deadlines/history, and one work queue tells staff what needs attention next.** The first release priorities should be navigation and Work Queue, the single case workspace, the tip-to-review path, and clear filing/deadline states. Everything else should support those flows rather than compete with them.
