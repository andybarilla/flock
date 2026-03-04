<script>
  export let sites = [];
  export let onRemove = () => {};

  function handleRemove(domain) {
    onRemove(domain);
  }
</script>

{#if sites.length === 0}
  <p class="text-base-content/50 py-8">No sites registered. Add one below.</p>
{:else}
  <table class="table table-zebra">
    <thead>
      <tr>
        <th>Domain</th>
        <th>Path</th>
        <th>PHP</th>
        <th>TLS</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each sites as site}
        <tr>
          <td class="font-semibold">{site.domain}</td>
          <td class="text-base-content/60 text-sm">{site.path}</td>
          <td>{site.php_version || '—'}</td>
          <td>{site.tls ? '✓' : '—'}</td>
          <td>
            <button class="btn btn-ghost btn-sm hover:btn-error" on:click={() => handleRemove(site.domain)}>
              Remove
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
