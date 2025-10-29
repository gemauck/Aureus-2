# Projects Page Performance Optimization

## Problem
The Projects page was taking a long time to load due to fetching large JSON fields for all projects when only displaying the list view.

## Root Cause
The GET `/api/projects` endpoint was returning ALL project data including large JSON fields:
- `tasksList` (potentially thousands of tasks)
- `taskLists` (list configurations)
- `customFieldDefinitions` (field definitions)
- `documents` (document lists)
- `comments` (comment threads)
- `activityLog` (activity history)
- `team` (team member lists)
- `documentSections` (document section data)

These fields can be hundreds of KB per project when serialized as JSON strings.

## Solution Implemented

### 1. Optimized API Query (`api/projects.js`)
- Modified the list endpoint to only fetch fields needed for the list view
- Used Prisma's `select` option to limit returned fields
- Fields included in optimized query:
  - `id`, `name`, `clientName`, `status`, `type`
  - `startDate`, `dueDate`, `assignedTo`, `description`
  - `createdAt`, `updatedAt`
- Excluded all large JSON fields

### 2. Updated Frontend (`src/components/projects/Projects.jsx`)
- Modified `handleViewProject` to fetch full project data when viewing details
- Modified `handleEditProject` to fetch full project data when editing
- Updated task count display to remove dependency on full tasks array
- Removed subtask counting from list view

## Benefits
- **Dramatically reduced payload size**: Only ~10-20 fields per project instead of all fields
- **Faster initial load**: Network transfer time reduced significantly
- **Better user experience**: List view loads quickly, full data loaded on-demand
- **Maintained functionality**: Detail view and edit modal still have access to all data

## Performance Impact
- **Before**: Loading 100 projects with large JSON fields could be 5-10MB+ of data
- **After**: Loading 100 projects with only essential fields is <100KB of data
- **Estimated speed improvement**: 50-100x faster for initial page load

## Files Modified
1. `api/projects.js` - Optimized list query with selective field fetching
2. `src/components/projects/Projects.jsx` - On-demand data fetching for detail/edit views

## Testing Recommendations
- Test loading Projects page with 10+ projects
- Test viewing a project detail
- Test editing a project
- Verify all fields are still accessible in detail view
- Check that task counts display correctly in list view

