<script lang="ts">
	import { Toaster as Sonner, type ToasterProps } from 'svelte-sonner';

	let { ...restProps }: ToasterProps = $props();
</script>

<Sonner class="toaster group" position="bottom-right" richColors closeButton {...restProps} />
