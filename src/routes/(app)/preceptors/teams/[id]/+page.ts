import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const [teamRes, sitesRes, preceptorsRes] = await Promise.all([
		fetch(`/api/preceptors/teams/${params.id}`),
		fetch('/api/sites'),
		fetch('/api/preceptors')
	]);

	const [teamData, sitesData, preceptorsData] = await Promise.all([
		teamRes.json(),
		sitesRes.json(),
		preceptorsRes.json()
	]);

	return {
		team: teamData.success ? teamData.data : null,
		sites: sitesData.success ? sitesData.data : [],
		preceptors: preceptorsData.success ? preceptorsData.data : [],
		teamId: params.id
	};
};
