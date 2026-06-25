import { describe, test, expect } from '@jest/globals';
import {
  VALID_PAGES,
  normalizeRoutePage,
  isValidPage,
  resolveInitialPage,
  APP_SHELL_STANDALONE_PAGES
} from '../../../src/components/layout/erpNavigationConfig.js';
import {
  ALL_MENU_ITEMS,
  filterMenuItemsForUser,
  partitionMenuItems
} from '../../../src/components/layout/erpMenuConfig.js';
import {
  getMainScrollClasses,
  getMainInnerClasses
} from '../../../src/components/layout/erpPageRegistry.js';
import {
  isFunctionComponent,
  isReactComponent,
  isFullProjectsComponent
} from '../../../src/components/layout/windowComponentUtils.js';

describe('erpNavigationConfig', () => {
  test('VALID_PAGES includes core modules', () => {
    expect(VALID_PAGES).toContain('dashboard');
    expect(VALID_PAGES).toContain('manufacturing');
    expect(VALID_PAGES).toContain('clients');
  });

  test('normalizeRoutePage maps crm to clients', () => {
    expect(normalizeRoutePage('crm')).toBe('clients');
    expect(normalizeRoutePage('projects')).toBe('projects');
  });

  test('isValidPage rejects unknown routes', () => {
    expect(isValidPage('dashboard')).toBe(true);
    expect(isValidPage('not-a-page')).toBe(false);
  });

  test('APP_SHELL_STANDALONE_PAGES includes expense capture', () => {
    expect(APP_SHELL_STANDALONE_PAGES).toContain('expense-capture');
  });
});

describe('erpMenuConfig', () => {
  test('ALL_MENU_ITEMS has dashboard first', () => {
    expect(ALL_MENU_ITEMS[0].id).toBe('dashboard');
  });

  test('filterMenuItemsForUser limits guest to projects shortcuts', () => {
    const items = filterMenuItemsForUser({ role: 'guest' }, null);
    expect(items.map((i) => i.id)).toEqual(['projects', 'my-tasks', 'my-notes']);
  });

  test('partitionMenuItems splits personal shortcuts', () => {
    const menu = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'my-tasks', label: 'My Tasks' },
      { id: 'messages', label: 'Messages' }
    ];
    const parts = partitionMenuItems(menu);
    expect(parts.primaryMenuItems).toHaveLength(1);
    expect(parts.myTasksMenuItem?.id).toBe('my-tasks');
    expect(parts.messagesMenuItem?.id).toBe('messages');
  });
});

describe('erpPageRegistry', () => {
  test('getMainScrollClasses uses clients mobile scroll lock', () => {
    const classes = getMainScrollClasses('clients', { effectiveIsMobile: true, isDark: false });
    expect(classes).toContain('overflow-x-auto');
    expect(classes).toContain('overflow-y-hidden');
    expect(classes).toContain('p-0');
    expect(classes).toContain('bg-[#f8fafc]');
  });

  test('getMainScrollClasses omits light bg in dark mode', () => {
    const classes = getMainScrollClasses('dashboard', { effectiveIsMobile: false, isDark: true });
    expect(classes).not.toContain('bg-[#f8fafc]');
  });

  test('getMainInnerClasses adds flex column for mobile dashboard', () => {
    const classes = getMainInnerClasses('dashboard', { effectiveIsMobile: true });
    expect(classes).toContain('flex flex-col min-h-0 min-w-0');
  });
});

describe('windowComponentUtils', () => {
  test('isReactComponent accepts function and memo-like objects', () => {
    expect(isFunctionComponent(() => {})).toBe(true);
    expect(isReactComponent(() => {})).toBe(true);
    expect(isReactComponent({ $$typeof: Symbol.for('react.memo') })).toBe(true);
    expect(isReactComponent(null)).toBe(false);
  });

  test('isFullProjectsComponent requires list marker', () => {
    const full = () => {};
    full._hasListView = true;
    expect(isFullProjectsComponent(full)).toBe(true);
    expect(isFullProjectsComponent(() => {})).toBe(false);
  });
});
