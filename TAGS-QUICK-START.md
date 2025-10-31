# Tags Quick Start Guide

## 🚀 Quick Setup

### Step 1: Apply Database Migration
```bash
./migrate-tags.sh
```

Or manually:
```bash
npx prisma generate
npx prisma migrate dev --name add_tags_system
```

### Step 2: Restart Server
```bash
# Stop server (Ctrl+C if running)
node server.js
```

### Step 3: Test in UI
1. Open any Client or Lead
2. Go to Overview tab
3. Scroll to "Tags" section
4. Click "New Tag" to create your first tag
5. Click "Add Tag" to assign existing tags

## ✅ What's Included

- ✅ Database schema (Tag and ClientTag models)
- ✅ API endpoints for tag management
- ✅ UI in ClientDetailModal
- ✅ UI in LeadDetailModal
- ✅ Color-coded tag display
- ✅ Create tags on-the-fly
- ✅ Assign/remove tags from clients/leads

## 📍 File Locations

### Backend
- `prisma/schema.prisma` - Database schema
- `api/tags.js` - Tag CRUD operations
- `api/clients/[id]/tags.js` - Tag associations
- `server.js` - Route configuration

### Frontend
- `src/components/clients/ClientDetailModal.jsx` - Client tag UI
- `src/components/clients/LeadDetailModal.jsx` - Lead tag UI

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag |
| PATCH | `/api/tags/[id]` | Update tag |
| DELETE | `/api/tags/[id]` | Delete tag |
| GET | `/api/clients/[id]/tags` | Get client tags |
| POST | `/api/clients/[id]/tags` | Add tag to client |
| DELETE | `/api/clients/[id]/tags?tagId=[id]` | Remove tag |

## 📝 Usage Example

```javascript
// Create a tag
POST /api/tags
{
  "name": "VIP Client",
  "color": "#FF5733"
}

// Add tag to client
POST /api/clients/client-id-here/tags
{
  "tagId": "tag-id-here"
}
```

## 🐛 Troubleshooting

**Tags not showing?**
- Run: `npx prisma generate`
- Check: Browser console for errors
- Verify: Migration completed successfully

**Can't create tags?**
- Check: Authentication token
- Verify: Database connection
- Ensure: Prisma client is generated

## 📚 Full Documentation

See `TAGS-IMPLEMENTATION.md` for complete details.

