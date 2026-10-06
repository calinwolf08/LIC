import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const [teamRes, sitesRes, preceptorsRes, serveableRes] = await Promise.all([
		fetch(`/api/preceptors/teams/${params.id}`),
		fetch('/api/sites'),
		fetch('/api/preceptors'),
		fetch(`/api/preceptors/teams/${params.id}/serveable`)
	]);

	const [teamData, sitesData, preceptorsData, serveableData] = await Promise.all([
		teamRes.json(),
		sitesRes.json(),
		preceptorsRes.json(),
		serveableRes.json().catch(() => ({ success: false }))
	]);

	return {
		team: teamData.success ? teamData.data : null,
		sites: sitesData.success ? sitesData.data : [],
		preceptors: preceptorsData.success ? preceptorsData.data : [],
		serveable: serveableData.success
			? serveableData.data
			: { serveable: [], overlap: true },
		teamId: params.id
	};
};
