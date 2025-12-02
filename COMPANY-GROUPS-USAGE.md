# Company Groups Feature - Usage Guide

## Where to Access Company Groups

The Company Groups feature is available in the **CRM/Clients** section of your ERP system.

### Step-by-Step Access:

1. **Navigate to CRM Section:**
   - Log into your ERP at `https://abcoafrica.co.za`
   - Click on **"Clients"** or **"CRM"** in the left sidebar navigation

2. **Open a Client:**
   - From the clients list, click on any existing client (or create a new one)
   - This opens the Client Detail Modal/Page

3. **Access Groups Tab:**
   - In the client detail view, you'll see tabs at the top:
     - Overview
     - **Groups** ← This is your new tab!
     - Contacts
     - Sites
     - Opportunities
     - Calendar
     - Projects
     - Service & Maintenance
     - Activity
     - Notes

4. **Click on the "Groups" Tab:**
   - Currently shows a placeholder message: "Company Groups feature is coming soon. Backend API is ready."
   - The full UI will be implemented next

## Current Status

### ✅ What's Working (Backend):
- Database schema is ready
- API endpoints are functional:
  - `GET /api/clients/groups` - List all company groups
  - `GET /api/clients/:id/groups` - Get groups for a specific client
  - `POST /api/clients/:id/groups` - Add client to a group
  - `DELETE /api/clients/:id/groups/:groupId` - Remove client from group
- Validation prevents circular references
- Primary parent relationship is stored

### 🚧 What's Pending (Frontend):
- Full Groups tab UI (currently just a placeholder)
- Group selector component
- Visual display of group relationships

## Using the API Directly (For Testing)

While the UI is being completed, you can test the backend API directly:

### 1. Get All Groups:
```bash
GET https://abcoafrica.co.za/api/clients/groups
```

### 2. Get Groups for a Specific Client:
```bash
GET https://abcoafrica.co.za/api/clients/{clientId}/groups
```

### 3. Add Client to Group:
```bash
POST https://abcoafrica.co.za/api/clients/{clientId}/groups
Body: {
  "groupId": "group-client-id",
  "role": "member"
}
```

### 4. Remove Client from Group:
```bash
DELETE https://abcoafrica.co.za/api/clients/{clientId}/groups/{groupId}
```

## Example: Exxaro Group Setup

To set up the Exxaro Group as mentioned:

1. Create "Exxaro Group" as a client (parent company)
2. Create child companies like "Exxaro Coal (Pty) Ltd"
3. Set the primary parent relationship
4. Add additional group memberships if needed

## Next Steps

Once the full UI is implemented, you'll be able to:
- Select a primary parent company from a dropdown
- Add clients to multiple groups
- View all group memberships
- Remove clients from groups
- See group hierarchies visually

## Need Help?

The backend is fully functional - you can use it programmatically or wait for the full UI implementation.

