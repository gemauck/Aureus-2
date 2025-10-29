# Section-Based Commenting Feature

## Overview

A trial implementation of a section-based commenting feature that allows users to provide contextual feedback on specific sections of your ERP system.

## Features

1. **SectionCommentWidget** - A reusable component that can be embedded in any section
2. **Enhanced FeedbackWidget** - Global feedback widget with comment viewing
3. **API Enhancements** - Filtered feedback retrieval by page and section

## Usage

### Adding Comments to a Section

To add commenting functionality to any section in your application, simply include the `SectionCommentWidget` component:

```jsx
// Example: In any component
const { SectionCommentWidget } = window;

// In your JSX:
<div className="your-section-container">
    <div className="flex items-center justify-between mb-4">
        <h2>Section Title</h2>
        <SectionCommentWidget 
            sectionId="clients-contacts"
            sectionName="Clients > Contacts"
        />
    </div>
    {/* Your section content */}
</div>
```

### Props

- `sectionId` (string, optional): Unique identifier for the section (e.g., "clients-contacts")
- `sectionName` (string, optional): Human-readable section name (e.g., "Clients > Contacts")
- `className` (string, optional): Additional CSS classes

### Example Implementation

```jsx
// In Clients.jsx or any component
import React from 'react';

const ClientsSection = () => {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2>Client Contacts</h2>
                {window.SectionCommentWidget && (
                    <SectionCommentWidget 
                        sectionId="clients-contacts"
                        sectionName="Clients > Contacts"
                    />
                )}
            </div>
            {/* Contacts list */}
        </div>
    );
};
```

## Components

### SectionCommentWidget

- **Location**: `src/components/feedback/SectionCommentWidget.jsx`
- **Features**:
  - Click "Comments" button to view/add comments
  - Shows comment count badge
  - Modal overlay for viewing and posting comments
  - Displays user avatars and timestamps
  - Dark mode support

### FeedbackWidget (Enhanced)

- **Location**: `src/components/feedback/FeedbackWidget.jsx`
- **Features**:
  - Global floating feedback button (bottom-right)
  - Shows recent comments from all sections
  - Full feedback form with type and severity
  - Dark mode support

## API Endpoints

### GET /api/feedback

Query parameters:
- `pageUrl` (optional): Filter by page URL
- `section` (optional): Filter by section identifier
- `includeUser` (optional): Include user details (true/false)

Example:
```
GET /api/feedback?pageUrl=/clients&section=contacts&includeUser=true
```

### POST /api/feedback

Body:
```json
{
  "message": "This section needs improvement",
  "pageUrl": "/clients",
  "section": "contacts",
  "type": "feedback",
  "severity": "medium",
  "meta": {}
}
```

## Database

Uses the existing `Feedback` model in Prisma:
- `pageUrl`: The page where the comment was made
- `section`: The specific section identifier
- `message`: The comment text
- `type`: feedback | bug | idea
- `severity`: low | medium | high
- `userId`: User who made the comment
- `meta`: Additional metadata (JSON)

## Deployment

No database migrations needed - the existing `Feedback` table structure supports this feature.

To deploy:
1. Build the JSX files: `npm run build:jsx`
2. Deploy to server: `git push && ssh server "cd /var/www/abcotronics-erp && git pull && pm2 restart abcotronics-erp"`

## Future Enhancements

- Reply/thread support
- Comment editing/deletion
- Email notifications for new comments
- Admin moderation panel
- Comment reactions (thumbs up, etc.)
- Rich text editor for comments

