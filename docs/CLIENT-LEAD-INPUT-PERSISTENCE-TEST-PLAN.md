# Client & Lead Input Persistence – Test Plan

Manual + automated checks: every persisted input is filled, saved, reloaded, and re-opened to confirm it still shows.

---

## CLIENT – Detail Modal

### Tab: Overview
| Field / input | formData key | How to verify |
|---------------|--------------|---------------|
| Entity Name * | `name` | text input |
| Industry | `industry` | select |
| Status | `status` | select (Active / Inactive / On Hold) |
| Website | `website` | text input, placeholder "https://example.com" |
| Address | `address` | text input, placeholder "Street address, City, Province, Postal Code" |
| General Notes | `notes` | textarea |
| News Feed Subscription | `rssSubscribed` | toggle button |
| Group Assignment | (groups) | button "+ Assign Group" + list |
| Services | `services` | multi-select chips |

### Tab: Contacts
- Add/edit/delete contacts (name, email, phone, role, etc.); stored in `contacts` and via API.

### Tab: Sites
- Add/edit/delete sites; stored in `sites` and via API.

### Tab: Calendar
- Follow-ups / calendar; uses `followUps`.

### Tab: Activity
- Activity log; uses `activityLog` (often read-only).

### Tab: Notes
- Comments; uses `comments`.

### Tab: KYC
| Section | Fields | formData path |
|---------|--------|----------------|
| Client Type | Individual / Company / Close Corporation / Trust / Government | `kyc.clientType` |
| Legal Entity | Registered Legal Name, Trading Name, Registration Number, VAT, Income Tax, Registered Address, Principal Place, Country of Incorporation | `kyc.legalEntity.*` |
| Directors | textarea | `kyc.directors*` |
| UBOs | textarea | `kyc.beneficialOwners*` |
| Business Profile | Industry sector, Core business activities, Primary operating locations, Years in operation | `kyc.businessProfile.*` |
| Banking Details | Bank name, Account holder, Account number, Branch code, Account type | `kyc.bankingDetails.*` |

### Tab: Opportunities
- Add/edit opportunities; stored via API.

### Tab: Projects
- Linked projects (often read-only from API).

### Tab: Service & Maintenance
- Service/maintenance data (API-driven).

### Tab: Contracts
- Contracts (when available); API-driven.

---

## LEAD – Detail Modal

### Tab: Overview
| Field / input | formData key | How to verify |
|---------------|--------------|---------------|
| Entity Name * | `name` | text input |
| Industry | `industry` | select |
| First Contact Date | `firstContactDate` | date input |
| Website | `website` | text input, placeholder "https://example.com" |
| Source | `source` | select |
| Stage (AIDA) | `stage` / `aidaStatus` | select |
| Address | `address` | text input |
| General Notes | `notes` | textarea |
| External Agent | `externalAgentId` | select |
| Value | `value` | number |
| Probability | `probability` | number |

### Tab: Contacts
- Same pattern as client contacts.

### Tab: Sites
- Same pattern as client sites.

### Tab: Calendar
- Follow-ups.

### Tab: Notes
- Comments.

### Tab: Proposals (if admin)
- Proposals list.

### Tab: Activity
- Activity log.

---

## Test procedure (per entity)

1. **Open** entity (client or lead) or create new.
2. **For each tab that has persisted inputs:**
   - Fill each field with a unique test value (e.g. `"TEST-PERSIST-<field>-<timestamp>"` or a known constant).
   - Save (e.g. “Update Client” / “Update Lead” or “Create Lead”).
3. **Reload** the page (F5 or navigate away and back).
4. **Re-open** the same entity.
5. **Confirm** each modified field still shows the value from step 2.

---

## Test values (examples)

- **Entity Name:** `Persistence Test Client 001` / `Persistence Test Lead 001`
- **Website:** `https://persist-test.example.com`
- **Address:** `123 Persist St, Test City, 2000`
- **General Notes:** `Notes persist test 001`
- **KYC Registered Legal Name:** `KYC Persist Test Ltd`
- **Lead First Contact Date:** today or a fixed date
- **Lead Source:** first non-empty option
- **Lead Stage:** e.g. Awareness / Interest / Desire / Action (as in UI)

---

## Browser verification steps (after you manually fill & save)

Use this flow to confirm persistence for any section:

1. **Manually** change one or more fields (type in the UI; do not rely on pasting into console).
2. Click **Update Client** or **Update Lead** (or **Create Lead** for new).
3. Wait until the button returns to “Update Client” / “Update Lead” (no “Saving...”).
4. Reload the page (F5 or navigate away and back to `/clients`).
5. Re-open the same client/lead.
6. For **Clients**, if you tested KYC: open the **KYC** tab and wait 2–4 seconds for the refetch.
7. Confirm each changed field still shows the value you entered.

---

## Automated run results (summary)

| Section | Field | Persistence | Note |
|--------|--------|-------------|------|
| **Client Overview** | General Notes | ✅ Pass | Set via test, save, refresh, reopen – value “Persistence test notes 2025” persisted. |
| **Client Overview** | Website | ✅ Pass | Fill (React native setter), save, refresh, reopen Acme – "https://persist-test.example.com" persisted (2025-01-26 run). |
| **Client Overview** | Address | ✅ Pass | "456 Persist Test Ave, Verify City, 3000" persisted after refresh + reopen. |
| **Client Overview** | Industry | ✅ Pass | Agriculture → save, refresh, reopen; list showed Agriculture • On Hold (2025-01-26). |
| **Client Overview** | Status | ✅ Pass | On Hold → save, refresh, reopen; list showed Agriculture • On Hold (2025-01-26). |
| **Client Overview** | Entity Name | ⚠️ Manual | Verify by typing, save, refresh, reopen. |
| **Client KYC** | Client Type, Registered Legal Name | ✅ Pass | Company + "KYC Persist Test Acme Ltd" – save, refresh, reopen Acme, open KYC tab, wait ~3s; both persisted (2025-01-26). |
| **Lead Overview** | Website | ✅ Pass | "https://persist-test.example.com" – fill, save, reload, reopen New Mining Company; persisted (2025-01-26). |
| **Lead Overview** | Address | ✅ Pass | "123 Persist St Lead, Test City, 2000" persisted after full reload. |
| **Lead Overview** | General Notes | ✅ Pass | "Lead persist test 2025" persisted after full reload. |
| **Lead Overview** | Industry | ✅ Pass | Agriculture → save, refresh, reopen; list showed "New Mining Company | Agriculture | On Hold" (2025-01-26). |
| **Lead Overview** | Stage | ✅ Pass | On Hold → save, refresh, reopen; list showed Agriculture • On Hold (2025-01-26). |
| **Lead Overview** | Entity Name, Source, AIDA, etc. | ⚠️ Manual | Same flow: type in UI, save, refresh, reopen, verify. |

**Client Overview** (Website, Address, General Notes, Industry, Status), **Client KYC** (Client Type, Registered Legal Name), and **Lead Overview** (Website, Address, General Notes, Industry, Stage) are confirmed to persist end-to-end via automated browser run. Entity Name, Source, AIDA, and other remaining fields: use the manual procedure above.

---

## Manual test checklist

Use one client and one lead. For each field: type a unique value → Save → Refresh → Re-open → Confirm the value is still there. Tick when done.

### Client – Overview
- [ ] Entity Name *
- [x] Industry *(auto-verified 2025-01-26)*
- [x] Status *(auto-verified 2025-01-26)*
- [x] Website *(auto-verified 2025-01-26)*
- [x] Address *(auto-verified 2025-01-26)*
- [x] General Notes *(auto-verified 2025-01-26)*
- [ ] News Feed toggle (Subscribed / Not subscribed)
- [ ] Group Assignment (if you add a group)
- [ ] Services (toggle chips)

### Client – KYC (open KYC tab, wait 2–4 s for load)
- [x] Client Type (Individual / Company / etc.) *(auto-verified 2025-01-26)*
- [x] Registered Legal Name *(auto-verified 2025-01-26)*
- [ ] Trading Name, Registration Number, VAT, Income Tax, Registered Address, Principal Place, Country of Incorporation
- [ ] Business Profile (Industry sector, Core business activities, Primary operating locations, Years in operation)
- [ ] Banking Details (Bank name, Account holder, Account number, Branch code, Account type)

### Client – other tabs (add then save, refresh, reopen)
- [ ] Contacts (add/edit contact, confirm after refresh)
- [ ] Sites (add/edit site)
- [ ] Notes (add comment)
- [ ] Opportunities (add/edit opportunity)

### Lead – Overview
- [ ] Entity Name *
- [x] Industry *(auto-verified 2025-01-26)*
- [ ] First Contact Date
- [x] Website *(auto-verified 2025-01-26)*
- [ ] Source
- [x] Stage *(auto-verified 2025-01-26; AIDA still manual)*
- [x] Address *(auto-verified 2025-01-26)*
- [x] General Notes *(auto-verified 2025-01-26)*
- [ ] External Agent
- [ ] Value
- [ ] Probability

### Lead – other tabs
- [ ] Contacts
- [ ] Sites
- [ ] Notes
- [ ] Proposals (admin)
