# Client-Project Linking Guide

## How It Works

### Automatic Project Association
Projects are automatically associated with clients when the project's "Client" field matches the client's name. For example:
- **Client:** "Exxaro Coal (Pty) Ltd"
- **Projects with client = "Exxaro Coal (Pty) Ltd"** → Automatically shown in client's Projects tab

### What is "Linking"?
Linking makes this association explicit in the client record by storing the project ID. This:
- ✅ Provides a clear visual connection
- ✅ Helps track which projects belong to which clients
- ✅ Allows quick navigation between clients and their projects
- ✅ Maintains relationships even if project names change

### Benefits of Linking

**For Account Managers:**
- See all projects for a client in one place
- Track project count and revenue per client
- Quick access to project details from client view

**For Project Managers:**
- Understand client context when working on projects
- See related projects for the same client
- Navigate between client info and project details

## How to Use

### Viewing Linked Projects
1. Open a client detail modal
2. Click the **"Projects"** tab
3. See "Current Projects" section with all linked projects
4. **Click any project** to navigate to its full details

### Linking a Project
1. In client's Projects tab, look for "Available Projects to Link"
2. These are projects where the client field matches this client's name
3. Click the **link icon** (🔗) next to a project to link it
4. The project moves to "Current Projects" section

### Unlinking a Project
1. Find the project in "Current Projects" section
2. Click the **unlink icon** (🔗⃠) next to the project
3. The project moves to "Available Projects to Link" (if applicable)

## Navigation Flow

### From Client to Project
1. Open client detail
2. Go to Projects tab
3. **Click on any linked project**
4. Alert appears: "Opening project... Please click 'Projects' in sidebar"
5. Click **"Projects"** in sidebar
6. Project automatically opens in detail view

### From Project to Client
1. In any project, note the client name
2. Go to **Clients** module
3. Find and open that client
4. See all linked projects

## Technical Details

### Data Storage
- **Client record** stores: `projectIds: [1, 2, 3]`
- **Project record** stores: `client: "Client Name"`
- Both methods work together for flexibility

### Automatic Updates
- When you create a project with a client name
- That project appears in "Available Projects to Link"
- You can then link it to make the association explicit
- Revenue calculations include linked projects

## Use Cases

### Scenario 1: Fuel Service Provider (Your Business)
**Client:** "Exxaro Coal (Pty) Ltd"
**Projects:**
- Exxaro LPN Diesel Refunds
- Exxaro GO Diesel Refunds  
- Exxaro Belfast Diesel Refunds

All three projects are linked to this client, making it easy to see all ongoing work at a glance.

### Scenario 2: Multi-Site Clients
**Client:** "National Mining Corp"
**Projects:**
- Site A Fuel Management
- Site B Telemetry Installation
- Site C Diesel Audit

Linking helps you track multiple concurrent projects for the same organization.

### Scenario 3: Revenue Tracking
The Clients module shows **total revenue per client** by summing up:
- Linked project budgets
- Historical revenue data
- Active contracts

This helps with account management and reporting.

## FAQ

**Q: Do I have to link projects manually?**
A: No, projects with matching client names automatically appear. Linking just makes it explicit.

**Q: What happens if I unlink a project?**
A: The project still exists, but won't show in the client's "Current Projects" list.

**Q: Can one project link to multiple clients?**
A: A project has one primary client, but you can create separate projects for different sites.

**Q: Why can't I see a project in "Available to Link"?**
A: The project's client field must exactly match the client's name. Check spelling!

**Q: Is linking required?**
A: No, but it's recommended for:
- Better organization
- Easier navigation
- Accurate revenue tracking
- Client relationship management

## Best Practices

### When Creating Projects
1. Always fill in the "Client" field accurately
2. Use the exact client name from your Clients list
3. Projects will automatically appear for linking

### Account Management
1. Link important ongoing projects
2. Review client's Projects tab regularly
3. Use it for status updates and client meetings
4. Track project count per client

### Reporting
1. Use linked projects for client revenue reports
2. Track project completion rates per client
3. Identify high-value clients by project count
4. Monitor active vs completed project ratios

---

## Summary

**Yes, linking has relevance!** It helps you:
- ✅ Organize work by client
- ✅ Navigate quickly between clients and projects
- ✅ Track revenue and project counts
- ✅ Manage client relationships effectively
- ✅ Generate accurate reports

The linking feature is especially valuable for:
- **Service businesses** (like yours) with ongoing client work
- **Multi-project clients** with various sites or initiatives
- **Account management** and client relationship tracking
- **Revenue reporting** and business analytics

---

**Version:** 1.0.0  
**Last Updated:** 2025-10-13  
**Status:** ✅ Active Feature
