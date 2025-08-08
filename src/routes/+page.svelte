<script lang="ts">
	import { authClient } from '$lib/auth-client';

	const session = authClient.useSession();
	console.log(session);
</script>

<div class="bg-blue p-20 text-light-green">
	<h1>Welcome to SvelteKit</h1>
	<p>
		Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation
	</p>
</div>
