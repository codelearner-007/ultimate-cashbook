// Shared constants for the book-sharing feature.
// Used by AddCollaboratorScreen, EditShareSheet, and ManageSharesScreen.

export const RIGHTS = [
  {
    key:       'view',
    icon:      'eye',
    title:     'View Only',
    desc:      'Can read entries and all shared sections',
    color:     '#0284C7',
    light:     '#E0F2FE',
    darkLight: '#0C2A3E',
  },
  {
    key:       'view_create_edit',
    icon:      'edit-3',
    title:     'View & Edit',
    desc:      'Can also add and edit entries',
    color:     '#D97706',
    light:     '#FEF3C7',
    darkLight: '#2D1A00',
  },
  {
    key:       'view_create_edit_delete',
    icon:      'unlock',
    title:     'Full Access',
    desc:      'Can also permanently delete entries',
    color:     '#059669',
    light:     '#D1FAE5',
    darkLight: '#022C22',
  },
];

export const RIGHTS_MAP = Object.fromEntries(RIGHTS.map(r => [r.key, r]));

export const SCREENS = [
  { key: 'entries',       label: 'Entries',       icon: 'list',        required: true  },
  { key: 'categories',    label: 'Categories',    icon: 'tag',         required: false },
  { key: 'contacts',      label: 'Contacts',      icon: 'users',       required: false },
  { key: 'payment_modes', label: 'Payment Modes', icon: 'credit-card', required: false },
  { key: 'reports',       label: 'Reports',       icon: 'bar-chart-2', required: false },
  { key: 'settings',      label: 'Settings',      icon: 'settings',    required: true  },
];

export const DEFAULT_SCREENS = {
  entries:       true,
  categories:    false,
  contacts:      false,
  payment_modes: false,
  reports:       false,
  settings:      true,
};

export const getInitials = (str = '') =>
  str.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
