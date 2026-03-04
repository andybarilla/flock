<script>
  import { onMount } from 'svelte';
  import { ListSites, AddSite, RemoveSite } from '../wailsjs/go/main/App.js';
  import SiteList from './SiteList.svelte';
  import AddSiteForm from './AddSiteForm.svelte';

  let sites = [];
  let error = '';

  async function refreshSites() {
    try {
      sites = await ListSites() || [];
      error = '';
    } catch (e) {
      error = 'Failed to load sites: ' + (e.message || String(e));
    }
  }

  async function handleAdd(path, domain, phpVersion, tls) {
    await AddSite(path, domain, phpVersion, tls);
    await refreshSites();
  }

  async function handleRemove(domain) {
    try {
      await RemoveSite(domain);
      await refreshSites();
    } catch (e) {
      error = 'Failed to remove site: ' + (e.message || String(e));
    }
  }

  onMount(refreshSites);
</script>

<main class="max-w-3xl mx-auto px-6 py-8 text-left">
  <header class="mb-8">
    <h1 class="text-2xl font-bold m-0">Flock</h1>
    <p class="text-base-content/50 mt-1 text-sm">Local Development Environment</p>
  </header>

  {#if error}
    <div class="alert alert-error mb-4 text-sm">{error}</div>
  {/if}

  <section class="card bg-base-200 p-6">
    <h2 class="text-sm text-base-content/60 uppercase tracking-wide mb-4 font-semibold">Sites</h2>
    <SiteList {sites} onRemove={handleRemove} />
    <AddSiteForm onAdd={handleAdd} />
  </section>
</main>
