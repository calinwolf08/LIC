import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { fixtures } from './helpers/fixtures';
import { assertions } from './helpers/assertions';

test.describe('Sites API', () => {
	let healthSystemId: number;

	test.beforeEach(async ({ request }) => {
		// Create a health system for tests
		const api = createApiClient(request);
		const hsData = fixtures.healthSystem();
		const response = await api.post('/api/scheduling-config/health-systems', hsData);
		const hs = await api.expectJson(response, 201);
		healthSystemId = hs.id;
	});

	test.describe('POST /api/sites', () => {
		test('should create a new site', async ({ request }) => {
			const api = createApiClient(request);
			const siteData = fixtures.site({ health_system_id: healthSystemId });

			const response = await api.post('/api/sites', siteData);
			const site = await api.expectJson(response, 201);

			assertions.crud.created(site, {
				name: siteData.name,
				health_system_id: healthSystemId,
				site_type: siteData.site_type
			});
		});

		test('should create site with different types', async ({ request }) => {
			const api = createApiClient(request);

			for (const siteType of ['clinic', 'hospital', 'mixed'] as const) {
				const siteData = fixtures.site({
					health_system_id: healthSystemId,
					site_type: siteType
				});

				const response = await api.post('/api/sites', siteData);
				const site = await api.expectJson(response, 201);

				expect(site.site_type).toBe(siteType);
			}
		});

		test('should reject site with missing health_system_id', async ({ request }) => {
			const api = createApiClient(request);
			const invalidData = {
				name: 'Test Site',
				site_type: 'clinic'
			};

			const response = await api.post('/api/sites', invalidData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});

		test('should reject site with invalid site_type', async ({ request }) => {
			const api = createApiClient(request);
			const siteData = {
				name: 'Test Site',
				health_system_id: healthSystemId,
				site_type: 'invalid_type'
			};

			const response = await api.post('/api/sites', siteData);
			const error = await api.expectError(response, 400);

			assertions.validationError(error);
		});
	});

	test.describe('GET /api/sites', () => {
		test('should list all sites', async ({ request }) => {
			const api = createApiClient(request);

			const s1 = fixtures.site({ health_system_id: healthSystemId });
			const s2 = fixtures.site({ health_system_id: healthSystemId });
			await api.post('/api/sites', s1);
			await api.post('/api/sites', s2);

			const response = await api.get('/api/sites');
			const sites = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(sites);
			assertions.hasMinLength(items, 2);
		});

		test('should filter sites by health_system_id', async ({ request }) => {
			const api = createApiClient(request);

			// Create second health system
			const hs2Data = fixtures.healthSystem();
			const hs2Response = await api.post('/api/scheduling-config/health-systems', hs2Data);
			const hs2 = await api.expectJson(hs2Response, 201);

			// Create sites in different health systems
			const site1 = fixtures.site({ health_system_id: healthSystemId });
			const site2 = fixtures.site({ health_system_id: hs2.id });

			await api.post('/api/sites', site1);
			await api.post('/api/sites', site2);

			// Filter by first health system
			const response = await api.get('/api/sites', {
				params: { health_system_id: String(healthSystemId) }
			});
			const sites = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(sites);
			items.forEach(s => {
				expect(s.health_system_id).toBe(healthSystemId);
			});
		});
	});

	test.describe('GET /api/sites/:id', () => {
		test('should get site by id', async ({ request }) => {
			const api = createApiClient(request);
			const siteData = fixtures.site({ health_system_id: healthSystemId });

			const createResponse = await api.post('/api/sites', siteData);
			const created = await api.expectJson(createResponse, 201);

			const response = await api.get(`/api/sites/${created.id}`);
			const site = await api.expectJson(response);

			assertions.hasFields(site, ['id', 'name', 'health_system_id', 'site_type']);
			expect(site.id).toBe(created.id);
			expect(site.health_system_id).toBe(healthSystemId);
		});

		test('should return 404 for non-existent site', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.get('/api/sites/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('PATCH /api/sites/:id', () => {
		test('should update site fields', async ({ request }) => {
			const api = createApiClient(request);
			const siteData = fixtures.site({
				health_system_id: healthSystemId,
				site_type: 'clinic'
			});

			const createResponse = await api.post('/api/sites', siteData);
			const created = await api.expectJson(createResponse, 201);

			const updates = {
				name: 'Updated Site Name',
				site_type: 'hospital' as const
			};

			const response = await api.patch(`/api/sites/${created.id}`, updates);
			const updated = await api.expectJson(response);

			assertions.crud.updated(updated, updates);
		});

		test('should return 404 when updating non-existent site', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.patch('/api/sites/999999', { name: 'Test' });
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('DELETE /api/sites/:id', () => {
		test('should delete site', async ({ request }) => {
			const api = createApiClient(request);
			const siteData = fixtures.site({ health_system_id: healthSystemId });

			const createResponse = await api.post('/api/sites', siteData);
			const created = await api.expectJson(createResponse, 201);

			const deleteResponse = await api.delete(`/api/sites/${created.id}`);
			await api.expectSuccess(deleteResponse);

			const getResponse = await api.get(`/api/sites/${created.id}`);
			await api.expectError(getResponse, 404);
		});

		test('should return 404 when deleting non-existent site', async ({ request }) => {
			const api = createApiClient(request);

			const response = await api.delete('/api/sites/999999');
			const error = await api.expectError(response, 404);

			assertions.notFoundError(error);
		});
	});

	test.describe('Clerkship-Site Associations', () => {
		test('should associate clerkship with site', async ({ request }) => {
			const api = createApiClient(request);

			// Create clerkship and site
			const clerkshipData = fixtures.clerkship();
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(clerkshipResponse, 201);

			const siteData = fixtures.site({ health_system_id: healthSystemId });
			const siteResponse = await api.post('/api/sites', siteData);
			const site = await api.expectJson(siteResponse, 201);

			// Create association
			const associationData = {
				clerkship_id: clerkship.id,
				site_id: site.id
			};

			const response = await api.post('/api/clerkship-sites', associationData);
			await api.expectSuccess(response);

			// Verify association exists
			const getResponse = await api.get('/api/clerkship-sites', {
				params: { clerkship_id: String(clerkship.id) }
			});
			const associations = await api.expectJson<any[]>(getResponse);

			const items = assertions.hasItems(associations);
			assertions.containsWhere(items, a => a.site_id === site.id);
		});

		test('should get associations by site_id', async ({ request }) => {
			const api = createApiClient(request);

			// Create clerkship and site
			const clerkshipData = fixtures.clerkship();
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(clerkshipResponse, 201);

			const siteData = fixtures.site({ health_system_id: healthSystemId });
			const siteResponse = await api.post('/api/sites', siteData);
			const site = await api.expectJson(siteResponse, 201);

			// Create association
			await api.post('/api/clerkship-sites', {
				clerkship_id: clerkship.id,
				site_id: site.id
			});

			// Get by site_id
			const response = await api.get('/api/clerkship-sites', {
				params: { site_id: String(site.id) }
			});
			const associations = await api.expectJson<any[]>(response);

			const items = assertions.hasItems(associations);
			assertions.containsWhere(items, a => a.clerkship_id === clerkship.id);
		});

		test('should delete clerkship-site association', async ({ request }) => {
			const api = createApiClient(request);

			// Create and associate
			const clerkshipData = fixtures.clerkship();
			const clerkshipResponse = await api.post('/api/clerkships', clerkshipData);
			const clerkship = await api.expectJson(clerkshipResponse, 201);

			const siteData = fixtures.site({ health_system_id: healthSystemId });
			const siteResponse = await api.post('/api/sites', siteData);
			const site = await api.expectJson(siteResponse, 201);

			await api.post('/api/clerkship-sites', {
				clerkship_id: clerkship.id,
				site_id: site.id
			});

			// Delete association
			const deleteResponse = await api.delete('/api/clerkship-sites', {
				params: {
					clerkship_id: String(clerkship.id),
					site_id: String(site.id)
				}
			});
			await api.expectSuccess(deleteResponse);

			// Verify deleted
			const getResponse = await api.get('/api/clerkship-sites', {
				params: { clerkship_id: String(clerkship.id) }
			});
			const associations = await api.expectJson<any[]>(getResponse);

			const items = assertions.hasItems(associations);
			const found = items.find(a => a.site_id === site.id);
			expect(found).toBeUndefined();
		});
	});

	test.describe('Full CRUD workflow', () => {
		test('should complete full site lifecycle', async ({ request }) => {
			const api = createApiClient(request);

			// CREATE
			const siteData = fixtures.site({
				health_system_id: healthSystemId,
				site_type: 'clinic'
			});

			const createResponse = await api.post('/api/sites', siteData);
			const created = await api.expectJson(createResponse, 201);
			const siteId = assertions.hasId(created);

			// READ
			const getResponse = await api.get(`/api/sites/${siteId}`);
			const fetched = await api.expectJson(getResponse);
			expect(fetched.health_system_id).toBe(healthSystemId);
			expect(fetched.site_type).toBe('clinic');

			// UPDATE
			const updateResponse = await api.patch(`/api/sites/${siteId}`, {
				site_type: 'hospital'
			});
			const updated = await api.expectJson(updateResponse);
			expect(updated.site_type).toBe('hospital');

			// LIST
			const listResponse = await api.get('/api/sites', {
				params: { health_system_id: String(healthSystemId) }
			});
			const sites = await api.expectJson<any[]>(listResponse);
			const items = assertions.hasItems(sites);
			assertions.containsWhere(items, s => s.id === siteId);

			// DELETE
			const deleteResponse = await api.delete(`/api/sites/${siteId}`);
			await api.expectSuccess(deleteResponse);

			// VERIFY DELETED
			const verifyResponse = await api.get(`/api/sites/${siteId}`);
			await api.expectError(verifyResponse, 404);
		});
	});
});
