# Comment Attachments in Document Collection & FMS Trackers

Comment attachments are supported in:

- **Monthly Document Collection Checklist**
- **Monthly FMS Review**
- **Weekly FMS Review**

## Behaviour

- **Add:** Paperclip in the “Add Comment” header opens a file picker (multiple files; PDF, DOC, XLS, images, TXT).
- **Before send:** Chosen files appear as chips; × removes one.
- **On send:** Files are uploaded to `/api/files`, then the comment is saved with `attachments: [{ name, url }]`.
- **Display:** Under each comment, attachments show as “paperclip + name” links that open in a new tab.
- **Click handling:** Attachment links use a capture-phase mousedown and `target="_blank"` so the comment popup “click outside” logic does not run and the file opens in a new tab.

## Storage

- **Upload:** `POST /api/files` with `{ name, dataUrl, folder }`. Folders: `doc-collection-comments`, `monthly-fms-comments`, `weekly-fms-comments`.
- **Persistence:** Attachment arrays are stored on comments:
  - **Document Collection:** `DocumentItemComment.attachments` (JSON string).
  - **Monthly FMS:** `MonthlyFMSReviewItemComment.attachments`.
  - **Weekly FMS:** `WeeklyFMSReviewItemComment.attachments`.

## Migrations (already applied)

- `20260127000000_add_comment_attachments` – `DocumentItemComment.attachments`
- `20260127000001_add_fms_comment_attachments` – `MonthlyFMSReviewItemComment.attachments`, `WeeklyFMSReviewItemComment.attachments`

To run again elsewhere: `npx prisma migrate deploy`

## Code touchpoints

| Area | Location |
|------|----------|
| Document Collection UI + save | `src/components/projects/MonthlyDocumentCollectionTracker.jsx` |
| Monthly FMS UI + save | `src/components/projects/MonthlyFMSReviewTracker.jsx` |
| Weekly FMS UI + save | `src/components/projects/WeeklyFMSReviewTracker.jsx` |
| Document sections save/load | `api/projects.js` – `saveDocumentSectionsToTable`, `documentSectionsToJson` |
| Monthly FMS save/load | `api/projects.js` – `saveMonthlyFMSReviewSectionsToTable`, `monthlyFMSReviewSectionsToJson` |
| Weekly FMS save/load | `api/projects.js` – `saveWeeklyFMSReviewSectionsToTable`, `weeklyFMSReviewSectionsToJson` |
| File upload | `api/files.js` |

## “Click outside” and attachment links

The comment popup closes on mousedown outside. Attachment links sit in a wrapper with `onMouseDownCapture={(e) => e.stopPropagation()}` so that mousedown never reaches the document listener. The “click outside” logic also treats `[data-comment-attachment]` and `[data-comment-attachment-area]` as inside the popup.
