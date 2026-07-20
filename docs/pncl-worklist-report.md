# PNCL Worklist Report — DONNY!!! Sheet

**Report date:** July 15, 2026  
**Source:** [PNCL Worklist spreadsheet](https://docs.google.com/spreadsheets/d/1OVegxkUbHBtR5jIZ4lZzJZUZSh3qrjOS0oJKcceFDJY/edit?usp=sharing) — DONNY!!! tab  
**Target 100% complete:** July 22, 2026 (1 week from July 15)

---

## Executive Summary

The DONNY!!! sheet has ~57 line items. Roughly 22 are **Complete** and validated. The remaining ~35 items are in **Review**, **In Progress**, or **Not started**. With focused execution, all open items can land by **July 22, 2026**.

| Category | Count | Target |
|----------|------:|--------|
| Complete | ~22 | — |
| Review (needs validation) | 7 | Jul 15–17 |
| In Progress | 7 | Jul 16–20 |
| Not started | ~19 | Jul 15–22 |

### Week-at-a-glance

| Date | Focus |
|------|-------|
| **Jul 15 (Tue)** | Merge in-flight work; quick wins; admin access; backfills |
| **Jul 16 (Wed)** | Urgent licensing steps; badges; comp attachment flow |
| **Jul 17 (Thu)** | Genesis migration; carrier statuses; hierarchy export; profile gaps |
| **Jul 18 (Fri)** | Genesis tab removal; pay tier in hierarchy; W-9 preview; comp auto-assign |
| **Jul 19 (Sat)** | ICA variants; pay tier history; downline hierarchy |
| **Jul 20 (Sun)** | SMS notifications + opt-in language |
| **Jul 21 (Mon)** | Integration polish; blocked-item follow-ups |
| **Jul 22 (Tue)** | External deps; open questions; 100% sign-off |

---

## Complete — No Further Work

These items are marked **Complete** in the spreadsheet with no open validation notes.

| Item | Status |
|------|--------|
| Onboarding flow chart | ✅ Complete |
| Progress bar on profile | ✅ Complete |
| NPN & E&O inputs in profile | ✅ Complete |
| Licensing notification to Jordan | ✅ Complete |
| NPN/E&O completion dashboard | ✅ Complete |
| ICA completion notification/dashboard | ✅ Complete |
| Writing numbers on carrier credentials | ✅ Complete |
| Admin overview phase buckets | ✅ Complete |
| State licenses on profile | ✅ Complete |
| Kam pre-signed on ICA template | ✅ Complete |
| Admin editable profile | ✅ Complete |
| Ticket system | ✅ Complete |
| NPN on admin user list | ✅ Complete |
| PNCL Hub → pnclpay.com link | ✅ Complete |
| Pay policy / FAQs CMS page | ✅ Complete |
| Unique agent identifier (PNCL-00042) | ✅ Complete |
| Recruiting link pay-tier cap | ✅ Complete |
| Weekly LeadSupply charges report | ✅ Complete |
| Downloadable hierarchy/agents CSV export (v1) | ✅ Complete |
| Gate onboarding by category | ✅ Complete |
| Hierarchy partner linking | ✅ Complete |
| Read-only hierarchy view for Raychel | ✅ Complete |
| Expired status investigation | ✅ Complete |

---

## Open Items — With Due Dates

All due dates below fit within the **July 22, 2026** completion target.

### Review — Built, Validation Says "Needs Work"

| Item | Priority | Validation gap | Due date | Notes |
|------|----------|----------------|----------|-------|
| DL image, address, county | Urgent | Make county a required field | **Jul 15** | Local work in progress (`us-zip-county`, onboarding + profile) |
| Manual doc upload (admin) | High | Admin must upload docs for legacy agents | **Jul 15** | `AdminUserDocumentUploadPanel` + edge function in progress |
| Admin access for Bill, Matt | High | Add `bh@thepncl.com` | **Jul 15** | Role/config change |
| Badges for progress | High | More visible; add to dashboard | **Jul 16** | Badges on profile today; need dashboard prominence |
| Comp attachments via portal | High | Kam signs first, then agent | **Jul 16** | `AdminCompAttachmentPanel` + agent signing flow in progress |
| Insert Genesis steps into PNCL Hub | High | Brandon to send Pinnacle Life video links | **Jul 17** | Blocked on video URLs from Brandon |
| Admins upload docs to agent profile | High | Duplicate of manual upload row | **Jul 15** | Close with manual upload item |

### In Progress

| Item | Priority | Due date | Notes |
|------|----------|----------|-------|
| Modify licensing steps | Urgent | **Jul 16** | SureLC links, carrier groupings, gated New Producer, Jordan notification |
| Modify "Schedule your exam" step | Urgent | **Jul 16** | Prometric-only; remove NIPR language |
| Exam Study Tools missing link | — | **Jul 15** | Add `https://www.xcelsolutions.com` |
| Carrier statuses in profile | Medium | **Jul 17** | Admin checkbox → agent-visible status/badge |
| Updates to downloadable hierarchy | Urgent | **Jul 17** | Add carrier writing # columns, upline pay tier, pay-tier effective date |
| Comp tier on agent profile | Medium | **Jul 17** | Surface comp level to the agent |
| Affiliate vs Internal field | High | **Jul 17** | Brandon/Kam to provide roster; then wire ICA/routing |
| Bigger admin text | Medium | **Jul 16** | CSS token rollout; verify readability |
| Remove Genesis tab | Urgent | **Jul 18** | After Hub content confirmed complete |
| Move comp attachment in the flow | High | **Jul 16** | Clarify ordering vs ICA/licensing; implement |
| Comp attachment auto-assignment | High | **Jul 18** | Auto-assign from recruiting-link comp tier |
| Pay tiers in Admin hierarchy view | Low | **Jul 18** | Canvas + tree views |
| W-9 preview presentation issues | Medium | **Jul 18** | Validate preview vs agent view |
| Add comp schedule to ICA | — | **Jul 19** | Policy caps from Brandon/Kam before upload |
| Send specific ICA based on recruiter | High | **Jul 19** | Affiliate vs Internal ICA variants |
| Pay tier history with effective date | High | **Jul 19** | Agent, Pay Tier, Effective Date, updated-by audit |
| Create downline user hierarchy | — | **Jul 19** | Team-visible onboarding status (Kam) |
| Text notifications — daily progress | Medium | **Jul 20** | Daily SMS/email status updates |
| Opt-in language for SMS status | — | **Jul 20** | Companion to text notifications |
| Upload Pinnacle videos for modules | High | **Jul 17** | Use existing Genesis/Pinnacle videos |
| Update blank Agent # | Medium | **Jul 15** | Backfill 6 users (Cash Fulton, Hyunsuh Kang, Josh Hammond, Kenneth Kostiv, Raychel Weidler, Tafiti Fuimaono) |
| Security review w/ Colin | High | **Jul 18** | Process meeting — Vel + Colin |
| Brand pnclpay.com | Medium | **Jul 22** | External — Matt + Bill's developer |
| Pass PNCL Hub hierarchy to PLG Score | High | **Jul 22** | On hold until Brad provides guidance; webhook/feed |
| Should we automate HCMS connection? | — | **Jul 22** | Brandon decision — manual vs automate for now |
| Create new worklist for missing profile data | — | **Jul 22** | Meta cleanup pass for legacy agents |
| Setter/closer tracking (50/50 vs 70/30) | — | **Jul 22** | Product decision + implementation |
| Question — how will setter/closer be tracked? | — | **Jul 22** | Resolve with Matt; build if scope confirmed |

---

## Daily Schedule

### Tuesday, July 15 — Foundation & quick wins

- [ ] Merge/deploy county-required field (DL, address, county)
- [ ] Ship admin manual doc upload
- [ ] Grant admin access to `bh@thepncl.com`
- [ ] Backfill 6 missing Agent #s
- [ ] Add Exam Study Tools link (`xcelsolutions.com`)
- [ ] Close duplicate "admins upload docs" row

### Wednesday, July 16 — Urgent licensing + UX

- [ ] Rewrite licensing steps (SureLC accounts, carrier buckets, gating)
- [ ] Update Prometric exam step (remove NIPR)
- [ ] Phase badges on dashboard (not just profile)
- [ ] Comp attachment portal workflow (Kam → agent signing)
- [ ] Clarify and implement comp attachment position in flow
- [ ] Admin text size pass

### Thursday, July 17 — Content, carriers, exports

- [ ] Genesis/Pinnacle video embeds (pending Brandon links)
- [ ] Carrier application status checkboxes + agent badges
- [ ] Hierarchy CSV v2 (writing numbers, upline pay tier, effective date)
- [ ] Comp tier visible on agent profile
- [ ] Affiliate vs Internal field + roster import
- [ ] Upload Pinnacle videos for onboarding modules

### Friday, July 18 — Hierarchy, ICA routing, cleanup

- [ ] Remove Genesis admin tab
- [ ] Comp attachment auto-assignment from comp tier
- [ ] Pay tiers in hierarchy canvas/tree views
- [ ] W-9 preview investigation and fix
- [ ] Security review meeting (Colin)

### Saturday, July 19 — Commissions data model

- [ ] Pay tier history table + effective dates
- [ ] ICA variants by recruiter type (Affiliate vs Internal)
- [ ] Comp schedule added to ICA template
- [ ] Downline hierarchy with onboarding status (Kam)

### Sunday, July 20 — Notifications

- [ ] Daily progress text notifications
- [ ] SMS opt-in language and consent capture

### Monday, July 21 — Buffer & integration polish

- [ ] PLG Score feed prep (if Brad guidance received)
- [ ] End-to-end QA across onboarding → licensing → comp attachment
- [ ] Update spreadsheet statuses to match shipped work

### Tuesday, July 22 — 100% complete

- [ ] pnclpay.com branding sign-off (Matt / Bill's developer)
- [ ] PLG Score webhook/feed (or documented deferral with Brad)
- [ ] HCMS automation decision + implementation if yes
- [ ] Setter/closer tracking (or documented deferral with Matt)
- [ ] Legacy agent profile gap worklist executed or scheduled
- [ ] Final validation pass on all Review items
- [ ] **100% sign-off**

---

## External Dependencies & Blockers

| Dependency | Owner | Needed by | Risk if late |
|------------|-------|-----------|--------------|
| Pinnacle Life / Genesis video URLs | Brandon | Jul 17 | Genesis migration slips to Jul 18+ |
| Affiliate vs Internal roster | Brandon, Kam | Jul 17 | ICA routing slips to Jul 19 |
| Comp schedule / policy caps for ICA | Brandon, Kam | Jul 19 | ICA template update blocked |
| PLG Score feed spec | Brad | Jul 21 | Jul 22 item may defer |
| pnclpay branding | Bill's developer | Jul 22 | External; may defer without blocking Hub |
| Security review | Colin | Jul 18 | Process; does not block code ship |
| Setter/closer product decision | Matt | Jul 21 | Jul 22 build or defer |

---

## Open Questions

| Question | Owner | Resolve by |
|----------|-------|------------|
| Has `bh@thepncl.com` been granted admin access? | Matt | Jul 15 |
| Are Pinnacle Life video URLs ready? | Brandon | Jul 17 |
| Comp attachment vs ICA — final step order? | Kam / Jordan | Jul 16 |
| W-9 issues — preview only or agent-visible? | Matt | Jul 18 |
| Setter/closer: per-policy or per-agent-pair? | Matt / Bill | Jul 21 |
| PLG Score feed format and timeline? | Brad | Jul 21 |
| HCMS: automate now or stay manual? | Brandon | Jul 22 |

---

## Risk Notes

1. **Jul 16 is the critical day** — two Urgent licensing items plus comp attachment flow land together. If licensing spec needs more Kam/Jordan input, pull Brandon into a same-day sync.
2. **Brandon/Kam content** (videos, ICA caps, affiliate roster) is the main schedule risk for Jul 17–19.
3. **Jul 22 items** (pnclpay branding, PLG Score, setter/closer, HCMS) depend on external parties. Define "done" as either shipped or explicitly deferred with owner and next date.
4. **Local uncommitted work** (county, doc upload, comp attachments) should merge by **Jul 15** so Review items can close on schedule.

---

## Definition of Done (July 22)

- [ ] Every open spreadsheet row is **Complete** or **Deferred** with owner + next date
- [ ] All Review items re-validated and validation notes cleared
- [ ] Licensing steps live with SureLC links, gating, and Jordan notification
- [ ] Phase badges visible on dashboard and profile
- [ ] Admin can upload docs and assign comp attachments (Kam → agent)
- [ ] Hierarchy export includes writing numbers, upline pay tier, effective date
- [ ] Pay tier history tracked with effective dates
- [ ] Genesis tab removed; Hub content complete
- [ ] SMS notifications + opt-in live (or deferred with sign-off)
