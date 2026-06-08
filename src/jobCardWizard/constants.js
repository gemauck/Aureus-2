/** Shared job card wizard constants (web + React Native). */
import { JOB_CARD_CALL_OUT_CATEGORY_OPTIONS } from '../components/manufacturing/jobCardActivityDisplay.js';

export { JOB_CARD_CALL_OUT_CATEGORY_OPTIONS };

export const STEP_IDS = ['assignment', 'visit', 'work', 'stock', 'signoff'];

export const STEP_META = {
  assignment: {
    title: 'Team & Client',
    subtitle: 'Assign crew & site',
    icon: 'fa-user-check'
  },
  visit: {
    title: 'Site Visit',
    subtitle: 'Location & Time',
    icon: 'fa-route'
  },
  work: {
    title: 'Work Notes',
    subtitle: 'Diagnosis & work done',
    icon: 'fa-clipboard-list'
  },
  stock: {
    title: 'Stock & Costs',
    subtitle: 'Usage & purchases',
    icon: 'fa-boxes-stacked'
  },
  signoff: {
    title: 'Customer Sign-off',
    subtitle: 'Feedback & approval',
    icon: 'fa-signature'
  }
};

export const NO_CLIENT_ID = 'NO_CLIENT';

export const JOB_CARD_LOCAL_PENDING_KEY = 'manufacturing_jobcards';
export const MAX_LOCAL_PENDING_JOB_CARDS = 100;

export const JOB_CARD_PUBLIC_PRIOR_IDS_KEY = 'jobcard_public_prior_ids';
export const MAX_PUBLIC_PRIOR_IDS = 200;

export const PROJECT_ASSOCIATION_PREFIX = 'Project Association:';
export const HEADING_PREFIX = 'Heading:';
export const STOCK_TAKE_PAGE_SIZE = 50;
export const STOCK_TAKE_DRAFT_KEY = 'erpJobCard_stockTakeDraft_v1';
export const STOCK_TAKE_NOTES_SEP = '\n---\n';

export const SECTION_WORK_MEDIA_KEYS = ['diagnosis', 'actionsTaken', 'futureWorkRequired'];

export const JOB_CARD_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const JOB_CARD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const JOB_CARD_IMAGE_TARGET_BYTES = 1600 * 1024;
export const JOB_CARD_IMAGE_MAX_DIMENSION = 1920;
export const JOB_CARD_IMAGE_THUMB_MAX_DIMENSION = 360;
export const JOB_CARD_SYNC_WARN_PAYLOAD_BYTES = 18 * 1024 * 1024;
export const JOB_CARD_SYNC_HARD_PAYLOAD_BYTES = 28 * 1024 * 1024;
export const JOB_CARD_SYNC_REQUEST_TIMEOUT_MS = 60000;
export const JOB_CARD_SYNC_RETRY_ATTEMPTS = 2;
export const PRIOR_CARD_HEADING_MAX_CHARS = 36;

export const REFERENCE_CACHE_KEYS = {
  clients: 'manufacturing_clients',
  clientsAlt: 'clients',
  users: 'manufacturing_users',
  serviceFormTemplates: 'service_form_templates',
  inventory: 'manufacturing_inventory',
  locations: 'manufacturing_stock_locations',
  /** Per-location on-hand rows keyed by location UUID (van / warehouse stock picker). */
  locationInventory: 'manufacturing_location_inventory_v1',
  projects: 'manufacturing_projects',
  projectsAlt: 'projects'
};
