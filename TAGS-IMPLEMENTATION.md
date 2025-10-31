# Tags Implementation Guide

## Overview
This document describes the tagging system implementation for Clients and Leads in the Abcotronics ERP system.

## Database Schema

### New Models

#### Tag Model
- `id`: Unique identifier (cuid)
- `name`: Tag name (unique)
- `color`: Tag color (default: #3B82F6)
- `description`: Optional tag description
- `ownerId`: Optional owner user ID
- `createdAt`, `updatedAt`: Timestamps

#### ClientTag Model (Join Table)
- `id`: Unique identifier
- `clientId`: Foreign key to Client
- `tagId`: Foreign key to Tag
- `createdAt`: Timestamp
- **Unique constraint**: One tag can only be associated with a client once

### Relationships
- Client has many ClientTags (through tags relationship)
- Tag has many ClientTags (through clients relationship)
- Many-to-many relationship between Client and Tag

## API Endpoints

### Tags Management

#### GET `/api/tags`
List all available tags
```json
Response: {
  "data": {
    "tags": [
      {
        "id": "...",
        "name": "VIP Client",
        "color": "#FF5733",
        "description": "Important clients"
      }
    ]
  }
}
```

#### POST `/api/tags`
Create a new tag
```json
Request: {
  "name": "VIP Client",
  "color": "#FF5733",
  "description": "Important clients"
}
```

#### PATCH `/api/tags/[id]`
Update an existing tag
```json
Request: {
  "name": "Updated Name",
  "color": "#00FF00"
}
```

#### DELETE `/api/tags/[id]`
Delete a tag (will also remove all associations)

### Client/Lead Tag Associations

#### GET `/api/clients/[id]/tags`
Get all tags for a specific client/lead
```json
Response: {
  "data": {
    "tags": [...]
  }
}
```

#### POST `/api/clients/[id]/tags`
Add a tag to a client/lead
```json
Request: {
  "tagId": "tag-id-here"
}
```

#### DELETE `/api/clients/[id]/tags?tagId=[tagId]`
Remove a tag from a client/lead

## UI Features

### ClientDetailModal
- Tags section in Overview tab
- Display assigned tags with color-coded badges
- Dropdown to add existing tags
- "New Tag" button to create tags on-the-fly
- Remove tags with X button

### LeadDetailModal
- Same tag management features as ClientDetailModal
- Tags section in Overview tab
- Full tag creation and assignment capabilities

## Applying the Migration

### For Development
```bash
./migrate-tags.sh
```

Or manually:
```bash
npx prisma generate
npx prisma migrate dev --name add_tags_system
```

### For Production (PostgreSQL)
```bash
npx prisma generate
npx prisma migrate deploy
```

Or if using `db push`:
```bash
npx prisma db push
npx prisma generate
```

## Usage Examples

### Creating a Tag via UI
1. Open any Client or Lead detail modal
2. Go to Overview tab
3. Scroll to "Tags" section
4. Click "New Tag"
5. Enter tag name and select color
6. Click "Create & Add"
7. Tag is created and automatically assigned

### Assigning an Existing Tag
1. Open Client or Lead detail modal
2. Go to Overview tab
3. Scroll to "Tags" section
4. Click "Add Tag" dropdown
5. Select from available tags
6. Tag is immediately assigned

### Removing a Tag
1. In the Tags section, click the X button on any tag
2. Tag is immediately removed from the client/lead

## Technical Notes

### Data Flow
1. Client/Lead loads → Tags are fetched separately via `/api/clients/[id]/tags`
2. All available tags are loaded via `/api/tags`
3. Tags are managed independently from other client data
4. Tag operations are immediate (optimistic updates)

### Sharing Tags
- Tags are shared across all clients and leads
- Creating a tag makes it available to all clients/leads
- Deleting a tag removes it from all associations

### Color Coding
- Each tag has a customizable color
- Tags display with colored backgrounds and borders
- Default color is blue (#3B82F6)

## Troubleshooting

### Tags Not Appearing
1. Check browser console for API errors
2. Verify migration was applied: `npx prisma migrate status`
3. Ensure Prisma client is regenerated: `npx prisma generate`

### Can't Create Tags
1. Verify authentication token is valid
2. Check API endpoint is accessible
3. Verify database migration completed successfully

### Tags Not Saving
1. Check network tab for failed requests
2. Verify client/lead ID is correct
3. Ensure database connection is working

## Future Enhancements

Potential improvements:
- Tag filtering in client/lead lists
- Tag-based search
- Tag usage statistics
- Bulk tag assignment
- Tag categories/groups

