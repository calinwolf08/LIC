/**
 * Health Systems and Sites Fixtures
 *
 * Sample health systems and clinical sites for testing.
 */

import type { HealthSystem, Site } from '../types';

/**
 * Sample Health Systems
 */
export const healthSystemsFixtures: HealthSystem[] = [
  {
    id: 'hs-memorial',
    name: 'Memorial Health System',
    location: 'Downtown',
    description: 'Large urban teaching hospital system',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'hs-university',
    name: 'University Medical Center',
    location: 'University District',
    description: 'Academic medical center',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'hs-community',
    name: 'Community Health Network',
    location: 'Suburban',
    description: 'Community hospital network',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
];

/**
 * Sample Sites
 */
export const sitesFixtures: Site[] = [
  // Memorial Health System sites
  {
    id: 'site-memorial-main',
    healthSystemId: 'hs-memorial',
    name: 'Memorial Main Hospital',
    address: '123 Health St, Downtown',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'site-memorial-clinic',
    healthSystemId: 'hs-memorial',
    name: 'Memorial Outpatient Clinic',
    address: '456 Clinic Ave, Downtown',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },

  // University Medical Center sites
  {
    id: 'site-university-main',
    healthSystemId: 'hs-university',
    name: 'University Hospital',
    address: '789 Campus Dr, University District',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'site-university-pediatrics',
    healthSystemId: 'hs-university',
    name: 'University Pediatric Center',
    address: '101 Children Way, University District',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },

  // Community Health Network sites
  {
    id: 'site-community-north',
    healthSystemId: 'hs-community',
    name: 'Community North Hospital',
    address: '202 North Rd, Suburban',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'site-community-south',
    healthSystemId: 'hs-community',
    name: 'Community South Clinic',
    address: '303 South Blvd, Suburban',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
];
