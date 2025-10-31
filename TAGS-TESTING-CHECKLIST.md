# Tags Implementation - Testing Checklist

## Pre-Deployment Checklist

### Database
- [ ] Run `npx prisma generate` to generate Prisma client
- [ ] Run `npx prisma migrate dev --name add_tags_system` (development)
- [ ] Or run `npx prisma migrate deploy` (production)
- [ ] Verify migration succeeded: Check for `Tag` and `ClientTag` tables in database

### Server
- [ ] Restart server to load new Prisma client
- [ ] Verify server starts without errors
- [ ] Check server logs for any Prisma errors

### API Endpoints
- [ ] Test `GET /api/tags` - Should return empty array or existing tags
- [ ] Test `POST /api/tags` - Create a new tag
- [ ] Test `GET /api/clients/[id]/tags` - Get tags for a client
- [ ] Test `POST /api/clients/[id]/tags` - Add tag to client
- [ ] Test `DELETE /api/clients/[id]/tags?tagId=[id]` - Remove tag

## UI Testing Checklist

### Client Tag Management
- [ ] Open any Client detail modal
- [ ] Navigate to Overview tab
- [ ] Scroll to Tags section
- [ ] Verify "Tags" label is visible
- [ ] Create a new tag:
  - [ ] Click "New Tag" button
  - [ ] Enter tag name
  - [ ] Select color
  - [ ] Click "Create & Add"
  - [ ] Verify tag appears in list
  - [ ] Verify tag has correct color
- [ ] Add existing tag:
  - [ ] Click "Add Tag" dropdown
  - [ ] Select from available tags
  - [ ] Verify tag appears in list
- [ ] Remove tag:
  - [ ] Click X button on tag
  - [ ] Verify tag is removed
- [ ] Test keyboard shortcuts:
  - [ ] Press Enter in tag name field (should create)
  - [ ] Press Escape in tag name field (should cancel)

### Lead Tag Management
- [ ] Open any Lead detail modal
- [ ] Repeat all Client tag management tests
- [ ] Verify tags work identically

### Edge Cases
- [ ] Create tag with duplicate name (should fail gracefully)
- [ ] Add same tag twice to client (should prevent or handle gracefully)
- [ ] Delete tag that doesn't exist (should handle gracefully)
- [ ] Create tag without name (should show error)
- [ ] Test with empty tag list
- [ ] Test with many tags (10+)

### Visual Testing
- [ ] Verify tag colors display correctly
- [ ] Verify tags are readable (contrast)
- [ ] Test dark mode if applicable
- [ ] Verify tags wrap properly on narrow screens
- [ ] Check tag badges look good

## Data Validation

### Tag Properties
- [ ] Tag names are unique (test duplicate creation)
- [ ] Tag colors are saved correctly
- [ ] Tag descriptions are optional
- [ ] Tags are shared across clients/leads

### Associations
- [ ] One client can have multiple tags
- [ ] One tag can be on multiple clients
- [ ] Removing tag from client doesn't delete the tag
- [ ] Deleting a tag removes it from all clients

## Performance Testing
- [ ] Loading tags for client with many tags (50+)
- [ ] Loading all tags list with many tags (100+)
- [ ] Creating tags quickly (no UI lag)
- [ ] Adding/removing tags quickly (optimistic updates work)

## Browser Compatibility
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers

## Error Handling
- [ ] Network error during tag creation (shows error message)
- [ ] Network error during tag assignment (shows error message)
- [ ] Unauthorized access (shows appropriate error)
- [ ] Invalid tag ID (handles gracefully)

## Cleanup Testing
- [ ] Delete a tag that's assigned to clients
- [ ] Verify cascading delete works (ClientTag entries removed)
- [ ] Verify clients still load without errors

## Post-Deployment Verification
- [ ] Check server logs for errors
- [ ] Verify database tables exist
- [ ] Test in production environment
- [ ] Verify tags persist across page refreshes
- [ ] Test with real data (not just test data)

## Rollback Plan (if needed)
- [ ] Migration file location: `prisma/migrations/`
- [ ] To rollback: `npx prisma migrate resolve --rolled-back [migration-name]`
- [ ] Or manually drop tables: `Tag` and `ClientTag`
- [ ] Remove schema changes from `prisma/schema.prisma`

## Success Criteria
✅ All API endpoints respond correctly
✅ Tags can be created and assigned
✅ Tags display correctly in UI
✅ No console errors
✅ No database errors
✅ Performance is acceptable
✅ Error handling works properly

