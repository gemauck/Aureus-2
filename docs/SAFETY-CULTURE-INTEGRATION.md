# Safety Culture Integration

Integrate [Safety Culture](https://app.safetyculture.com/) (iAuditor) inspections and audits into your ERP.

## Prerequisites

- **Safety Culture Premium or Enterprise plan** (required for API access)
- **API token** from [Safety Culture integrations](https://app.safetyculture.com/integrations)
- API keys start with `scapi_`

## Setup

### 1. Get your API key

1. Log in to [Safety Culture](https://app.safetyculture.com/)
2. Go to **Integrations** or [app.safetyculture.com/integrations](https://app.safetyculture.com/integrations)
3. Create or copy your API token

### 2. Configure environment

Add to `.env` or `.env.local`:

```bash
SAFETY_CULTURE_API_KEY=scapi_xxxxxxxxxxxx
```

### 3. Verify connection

```bash
curl -H "Authorization: Bearer YOUR_JWT" https://YOUR_APP/api/safety-culture
```

You should see `configured: true` and `connected: true` if the integration is working.

## API Endpoints

All endpoints require a valid JWT (ERP login). Base path: `/api/safety-culture`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/safety-culture` | GET | Status and config |
| `/api/safety-culture/inspections` | GET | Inspections feed (paginated) |
| `/api/safety-culture/issues` | GET | Issues feed (paginated) |
| `/api/safety-culture/groups` | GET | Groups/organizations |

### Inspections feed

```
GET /api/safety-culture/inspections?modified_after=2025-01-01T00:00:00.000Z&limit=50
```

**Query parameters:**

- `modified_after` – ISO date; only inspections modified after this date
- `limit` – Max records per page (default 50)
- `completed` – `true`, `false`, or `both`
- `archived` – `true`, `false`, or `both`
- `next_page` – Use `metadata.next_page` from previous response for pagination

**Response:**

```json
{
  "data": {
    "inspections": [
      {
        "id": "audit_xxx",
        "name": "Site Inspection",
        "template_name": "General Workplace Inspection",
        "date_started": "2025-01-28T23:14:23.000Z",
        "date_completed": "2025-01-28T23:15:24.000Z",
        "score": 95,
        "web_report_link": "https://app.safetyculture.io/report/audit/audit_xxx"
      }
    ],
    "metadata": {
      "next_page": "/feed/inspections?limit=50&...",
      "remaining_records": 42
    }
  }
}
```

### Groups

```
GET /api/safety-culture/groups
```

Returns the groups and organizations your Safety Culture account belongs to.

## Import inspections as job cards

You can import Safety Culture inspections as ERP job cards:

1. Go to **Tools** → **Safety Culture Inspections**
2. Click **Import as Job Cards**
3. Inspections are created as job cards with: template name, owner, location, dates, score, and report link

Duplicate imports are skipped (tracked by `safetyCultureAuditId`). Imported job cards appear in **Manufacturing** → **Job Cards**.

**API:** `POST /api/safety-culture/import-job-cards`  
Body: `{ "limit": 200, "modified_after": "2025-01-01T00:00:00.000Z" }` (optional)

## Use cases in the ERP

- **Projects** – Link inspections to project sites; show compliance status
- **Teams** – Assign inspections to team members; schedule recurring audits
- **Manufacturing / Job cards** – Import inspections as job cards; attach reports
- **Reports** – Compliance dashboards and audit trails
- **Sites** – Map Safety Culture sites to ERP client sites

## Further integration

To extend the integration:

1. **Create inspections** – Safety Culture API supports creating inspections; add an endpoint to trigger inspections from projects or job cards
2. **Webhooks** – Safety Culture can send webhooks when inspections are completed; add a webhook handler to sync data in real time
3. **Linking** – Store Safety Culture audit IDs on projects, job cards, or sites for cross-reference

## References

- [Safety Culture Developer Portal](https://developer.safetyculture.com/)
- [API Reference](https://developer.safetyculture.com/reference)
- [Build custom integrations](https://help.safetyculture.com/en-US/001435/)
