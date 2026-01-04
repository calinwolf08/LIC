<script lang="ts">
	let { children } = $props();
</script>

<!-- Clean layout for public pages (landing, etc.) - no sidebar -->
<div class="min-h-screen">
	{@render children?.()}
</div>
