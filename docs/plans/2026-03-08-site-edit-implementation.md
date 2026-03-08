# Site Edit Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add edit functionality for sites across backend (Core + Wails binding + CLI) and frontend (reuse AddSiteForm in edit mode, edit buttons in table and card views).

**Architecture:** The registry already has an `Update()` method. We add a thin `UpdateSite` wrapper in Core, expose it via Wails binding, add a CLI `edit` command, then modify the frontend AddSiteForm to support edit mode with pre-populated fields and disabled domain input.

**Tech Stack:** Go (backend), Svelte (frontend), Vitest (frontend tests), Go testing (backend tests)

---

### Task 1: Core — Add UpdateSite method

**Files:**
- Modify: `internal/core/core.go:130-140`
- Test: `internal/core/core_test.go`

**Step 1: Write the failing test**

Add to `internal/core/core_test.go`:

```go
func TestUpdateSiteReloadsCaddy(t *testing.T) {
	cfg, runner, _, _, _, _ := testConfig(t)

	dir := t.TempDir()
	sitesJSON := fmt.Sprintf(`[{"path":%q,"domain":"app.test","php_version":"8.2"}]`, dir)
	os.MkdirAll(filepath.Dir(cfg.SitesFile), 0o755)
	os.WriteFile(cfg.SitesFile, []byte(sitesJSON), 0o644)

	c := core.NewCore(cfg)
	_ = c.Start()
	defer c.Stop()

	initialRuns := runner.runCalls

	newDir := t.TempDir()
	err := c.UpdateSite("app.test", registry.Site{
		Path:       newDir,
		Domain:     "app.test",
		PHPVersion: "8.3",
		TLS:        true,
	})
	if err != nil {
		t.Fatalf("UpdateSite: %v", err)
	}

	if runner.runCalls != initialRuns+1 {
		t.Errorf("caddy runCalls = %d, want %d (reload after UpdateSite)", runner.runCalls, initialRuns+1)
	}

	sites := c.Sites()
	if len(sites) != 1 {
		t.Fatalf("expected 1 site, got %d", len(sites))
	}
	if sites[0].PHPVersion != "8.3" {
		t.Errorf("php_version = %q, want 8.3", sites[0].PHPVersion)
	}
	if sites[0].Path != newDir {
		t.Errorf("path = %q, want %q", sites[0].Path, newDir)
	}
}

func TestUpdateSiteNotFound(t *testing.T) {
	cfg, _, _, _, _, _ := testConfig(t)
	c := core.NewCore(cfg)
	_ = c.Start()
	defer c.Stop()

	err := c.UpdateSite("nonexistent.test", registry.Site{Domain: "nonexistent.test", Path: "/tmp"})
	if err == nil {
		t.Error("expected error for nonexistent domain")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/core/ -run TestUpdateSite -v`
Expected: FAIL — `c.UpdateSite` undefined

**Step 3: Write minimal implementation**

Add to `internal/core/core.go` after `RemoveSite`:

```go
func (c *Core) UpdateSite(domain string, updated registry.Site) error {
	return c.registry.Update(domain, func(s *registry.Site) {
		s.Path = updated.Path
		s.PHPVersion = updated.PHPVersion
		s.NodeVersion = updated.NodeVersion
		s.TLS = updated.TLS
	})
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/core/ -run TestUpdateSite -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/core/core.go internal/core/core_test.go
git commit -m "feat: add UpdateSite method to Core"
```

---

### Task 2: Wails binding — Add UpdateSite

**Files:**
- Modify: `app.go:90-93`

**Step 1: Write the UpdateSite binding**

Add to `app.go` after `RemoveSite`:

```go
// UpdateSite updates an existing site's configuration
func (a *App) UpdateSite(domain, path, phpVersion, nodeVersion string, tls bool) error {
	return a.core.UpdateSite(domain, registry.Site{
		Path:        path,
		Domain:      domain,
		PHPVersion:  phpVersion,
		NodeVersion: nodeVersion,
		TLS:         tls,
	})
}
```

**Step 2: Regenerate Wails bindings**

Run: `cd /home/andy/dev/andybarilla/rook && wails generate module`

This generates `frontend/wailsjs/go/main/App.js` with the new `UpdateSite` export.

**Step 3: Verify it compiles**

Run: `cd /home/andy/dev/andybarilla/rook && go build ./...`
Expected: Success

**Step 4: Commit**

```bash
git add app.go frontend/wailsjs/
git commit -m "feat: add UpdateSite Wails binding"
```

---

### Task 3: CLI — Add edit command

**Files:**
- Modify: `internal/cli/sites.go`
- Modify: `internal/cli/root.go:27`
- Test: `internal/cli/sites_test.go`

**Step 1: Write the failing test**

Add to `internal/cli/sites_test.go`:

```go
func TestRenderEditJSON(t *testing.T) {
	var buf bytes.Buffer
	site := registry.Site{Path: "/home/user/myapp", Domain: "myapp.test", PHPVersion: "8.3"}
	cli.FormatJSON(&buf, site)

	var result registry.Site
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if result.PHPVersion != "8.3" {
		t.Errorf("php_version = %q, want 8.3", result.PHPVersion)
	}
}
```

**Step 2: Run test to verify it passes** (this test validates the output format — it should already pass since FormatJSON is generic)

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/cli/ -run TestRenderEditJSON -v`
Expected: PASS

**Step 3: Write the edit command**

Add to `internal/cli/sites.go` after `newRemoveCmd`:

```go
func newEditCmd() *cobra.Command {
	var path, phpVersion, nodeVersion string
	var tls *bool

	cmd := &cobra.Command{
		Use:   "edit <domain>",
		Short: "Edit a registered site",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			domain := args[0]

			c, cleanup, err := NewCore()
			if err != nil {
				return err
			}
			defer cleanup()

			site, ok := c.GetSite(domain)
			if !ok {
				return fmt.Errorf("site %q not found", domain)
			}

			if cmd.Flags().Changed("path") {
				absPath, err := filepath.Abs(path)
				if err != nil {
					return err
				}
				site.Path = absPath
			}
			if cmd.Flags().Changed("php") {
				site.PHPVersion = phpVersion
			}
			if cmd.Flags().Changed("node") {
				site.NodeVersion = nodeVersion
			}
			if cmd.Flags().Changed("tls") {
				site.TLS = *tls
			}

			if err := c.UpdateSite(domain, site); err != nil {
				return err
			}

			useJSON := jsonOutput || !IsTTY()
			if useJSON {
				FormatJSON(os.Stdout, site)
			} else {
				fmt.Fprintf(os.Stdout, "✓ Site %q updated\n", domain)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&path, "path", "", "Project directory path")
	cmd.Flags().StringVar(&phpVersion, "php", "", "PHP version")
	cmd.Flags().StringVar(&nodeVersion, "node", "", "Node version")
	tls = cmd.Flags().Bool("tls", false, "Enable TLS")

	return cmd
}
```

**Step 4: Add GetSite to Core**

The CLI edit command needs `Core.GetSite`. Add to `internal/core/core.go` after `Sites()`:

```go
func (c *Core) GetSite(domain string) (registry.Site, bool) {
	return c.registry.Get(domain)
}
```

**Step 5: Register the edit command**

Add to `internal/cli/root.go` after line 24 (`cmd.AddCommand(newRemoveCmd())`):

```go
	cmd.AddCommand(newEditCmd())
```

**Step 6: Run all CLI tests**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/cli/ -v`
Expected: PASS

**Step 7: Commit**

```bash
git add internal/core/core.go internal/cli/sites.go internal/cli/root.go internal/cli/sites_test.go
git commit -m "feat: add sites edit CLI command"
```

---

### Task 4: Frontend — AddSiteForm edit mode

**Files:**
- Modify: `frontend/src/AddSiteForm.svelte`
- Test: `frontend/src/AddSiteForm.test.js`

**Step 1: Write failing tests**

Add to `frontend/src/AddSiteForm.test.js`:

```javascript
describe('edit mode', () => {
  const editSite = {
    domain: 'app.test',
    path: '/home/user/app',
    php_version: '8.3',
    node_version: '20',
    tls: true,
  };

  it('shows "Edit Site" title when editingSite is provided', () => {
    const { container } = render(AddSiteForm, {
      props: { open: true, editingSite: editSite },
    });
    const title = container.querySelector('#add-site-title');
    expect(title.textContent).toBe('Edit Site');
  });

  it('pre-populates fields with site data', () => {
    const { container } = render(AddSiteForm, {
      props: { open: true, editingSite: editSite },
    });
    const pathInput = container.querySelector('input[placeholder="/home/user/projects/myapp"]');
    const domainInput = container.querySelector('input[placeholder="myapp.test"]');
    expect(pathInput.value).toBe('/home/user/app');
    expect(domainInput.value).toBe('app.test');
  });

  it('disables domain input in edit mode', () => {
    const { container } = render(AddSiteForm, {
      props: { open: true, editingSite: editSite },
    });
    const domainInput = container.querySelector('input[placeholder="myapp.test"]');
    expect(domainInput.disabled).toBe(true);
  });

  it('shows "Update Site" button text', () => {
    const { getByText } = render(AddSiteForm, {
      props: { open: true, editingSite: editSite },
    });
    expect(getByText('Update Site')).toBeTruthy();
  });

  it('calls onUpdate instead of onAdd when submitting', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { container, component } = render(AddSiteForm, {
      props: { open: true, editingSite: editSite, onUpdate },
    });
    const closeSpy = vi.fn();
    component.$on('close', closeSpy);
    const form = container.querySelector('form');
    await fireEvent.submit(form);
    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('app.test', '/home/user/app', '8.3', '20', true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/AddSiteForm.test.js`
Expected: FAIL — editingSite prop not recognized

**Step 3: Implement edit mode in AddSiteForm.svelte**

Modify `frontend/src/AddSiteForm.svelte` script section:

Add new props and reactive initialization:
```javascript
export let editingSite = null;
export let onUpdate = () => {};

$: isEditing = !!editingSite;

$: if (editingSite && open) {
  path = editingSite.path || '';
  domain = editingSite.domain || '';
  phpVersion = editingSite.php_version || '';
  nodeVersion = editingSite.node_version || '';
  tls = editingSite.tls || false;
}
```

Modify `handleSubmit` to branch on edit vs add:
```javascript
export async function handleSubmit() {
  if (!path || !domain) {
    notifyError('Path and domain are required.');
    return;
  }
  submitting = true;
  try {
    if (isEditing) {
      await onUpdate(domain, path, phpVersion, nodeVersion, tls);
      notifySuccess(`Site "${domain}" updated.`);
    } else {
      await onAdd(path, domain, phpVersion, nodeVersion, tls);
      notifySuccess(`Site "${domain}" added.`);
    }
    path = '';
    domain = '';
    phpVersion = '';
    nodeVersion = '';
    tls = false;
    detectedSource = '';
    dispatch('close');
  } catch (e) {
    notifyError(friendlyError(e.message || String(e)));
  } finally {
    submitting = false;
  }
}
```

Update the template:
- Title: `{isEditing ? 'Edit Site' : 'Add Site'}`
- Domain input: add `disabled={submitting || isEditing}`
- Submit button text: `{isEditing ? 'Update Site' : 'Add Site'}`
- Submitting text: `{isEditing ? 'Updating…' : 'Adding…'}`

**Step 4: Run tests to verify they pass**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/AddSiteForm.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/AddSiteForm.svelte frontend/src/AddSiteForm.test.js
git commit -m "feat: add edit mode to AddSiteForm"
```

---

### Task 5: Frontend — Edit button in SiteList (table view)

**Files:**
- Modify: `frontend/src/SiteList.svelte`
- Test: `frontend/src/SiteList.test.js`

**Step 1: Write failing tests**

Add to `frontend/src/SiteList.test.js`:

```javascript
describe('edit button', () => {
  it('renders Edit button in table view for each site', () => {
    const { getAllByTitle } = render(SiteList, {
      props: { sites: fakeSites, loaded: true, onRemove: vi.fn() },
    });
    const editButtons = getAllByTitle('Edit site');
    expect(editButtons.length).toBe(2);
  });

  it('dispatches editsite event with site data when Edit is clicked', async () => {
    const { getAllByTitle, component } = render(SiteList, {
      props: { sites: fakeSites, loaded: true, onRemove: vi.fn() },
    });
    const editSpy = vi.fn();
    component.$on('editsite', editSpy);
    await fireEvent.click(getAllByTitle('Edit site')[0]);
    expect(editSpy).toHaveBeenCalled();
    expect(editSpy.mock.calls[0][0].detail).toEqual(fakeSites[0]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/SiteList.test.js`
Expected: FAIL — no elements with title "Edit site"

**Step 3: Add edit button to table view**

In `frontend/src/SiteList.svelte`, in the table `<td>` actions cell (around line 148), add an edit button before the remove button:

```svelte
<td class="flex gap-1">
  <button
    class="btn btn-ghost btn-sm btn-square"
    title="Edit site"
    on:click={() => dispatch('editsite', site)}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
  </button>
  <button
    class="btn btn-ghost btn-sm hover:btn-error"
    ...existing remove button...
  </button>
</td>
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/SiteList.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/SiteList.svelte frontend/src/SiteList.test.js
git commit -m "feat: add edit button to site table view"
```

---

### Task 6: Frontend — Edit button in SiteCard

**Files:**
- Modify: `frontend/src/SiteCard.svelte`
- Test: `frontend/src/SiteCard.test.js`

**Step 1: Write failing tests**

Add to `frontend/src/SiteCard.test.js`:

```javascript
it('renders edit button', () => {
  const { getByTitle } = render(SiteCard, {
    props: { site: mockSite, onRemove: vi.fn() },
  });
  expect(getByTitle('Edit site')).toBeTruthy();
});

it('calls onEdit with site when edit button is clicked', async () => {
  const onEdit = vi.fn();
  const { getByTitle } = render(SiteCard, {
    props: { site: mockSite, onRemove: vi.fn(), onEdit },
  });
  await fireEvent.click(getByTitle('Edit site'));
  expect(onEdit).toHaveBeenCalledWith(mockSite);
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/SiteCard.test.js`
Expected: FAIL — no element with title "Edit site"

**Step 3: Add edit button to SiteCard**

In `frontend/src/SiteCard.svelte`:

Add prop:
```javascript
export let onEdit = () => {};
```

Add edit button next to remove button (in the top-right button area, around line 21):

```svelte
<div class="flex gap-1">
  <button
    class="btn btn-ghost btn-sm btn-square"
    title="Edit site"
    on:click={() => onEdit(site)}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
  </button>
  <button
    class="btn btn-ghost btn-sm btn-square hover:btn-error"
    title="Remove site"
    on:click={() => onRemove(site.domain)}
  >
    <!-- existing trash icon -->
  </button>
</div>
```

**Step 4: Also update SiteList.svelte to pass onEdit to SiteCard**

In the card view section of `SiteList.svelte`, pass the edit handler:

```svelte
<SiteCard {site} onRemove={requestRemove} onEdit={(s) => dispatch('editsite', s)} {runtimeStatuses} {miseAvailable} {onInstall} />
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/SiteCard.test.js src/SiteList.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/SiteCard.svelte frontend/src/SiteCard.test.js frontend/src/SiteList.svelte
git commit -m "feat: add edit button to site card view"
```

---

### Task 7: Frontend — Wire up App.svelte

**Files:**
- Modify: `frontend/src/App.svelte`
- Test: `frontend/src/App.test.js`

**Step 1: Write failing test**

Add to `frontend/src/App.test.js` mock:

```javascript
// In the vi.mock block at the top, add:
UpdateSite: vi.fn().mockResolvedValue(undefined),
```

Add test:

```javascript
describe('edit site', () => {
  it('opens edit form when editsite event is dispatched from SiteList', async () => {
    const { ListSites } = await import('../wailsjs/go/main/App.js');
    ListSites.mockResolvedValue([
      { domain: 'app.test', path: '/tmp/app', php_version: '8.3', node_version: '', tls: true },
    ]);
    vi.useFakeTimers();
    const { container } = render(App);
    await vi.waitFor(() => {
      expect(container.querySelector('table')).toBeTruthy();
    });
    // Click the edit button
    const editBtn = container.querySelector('[title="Edit site"]');
    await fireEvent.click(editBtn);
    vi.runAllTimers();
    await vi.waitFor(() => {
      const modal = container.querySelector('.modal');
      expect(modal).toBeTruthy();
      const title = container.querySelector('#add-site-title');
      expect(title.textContent).toBe('Edit Site');
    });
    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run src/App.test.js`
Expected: FAIL

**Step 3: Wire up App.svelte**

Import `UpdateSite`:
```javascript
import { ListSites, AddSite, RemoveSite, UpdateSite, DatabaseServices, StartDatabase, StopDatabase, CheckRuntimes, InstallRuntime, MiseStatus } from '../wailsjs/go/main/App.js';
```

Add state and handlers:
```javascript
let editingSite = null;

function handleEditSite(e) {
  editingSite = e.detail;
  addFormOpen = true;
}

async function handleUpdate(domain, path, phpVersion, nodeVersion, tls) {
  await UpdateSite(domain, path, phpVersion, nodeVersion, tls);
  await refreshSites();
  await refreshRuntimes();
}

function handleFormClose() {
  addFormOpen = false;
  editingSite = null;
}
```

Update SiteList to listen for editsite:
```svelte
<SiteList {sites} loaded={sitesLoaded} onRemove={handleRemove} {runtimeStatuses} {miseAvailable} onInstall={handleInstall} on:addsite={() => { editingSite = null; addFormOpen = true; }} on:editsite={handleEditSite} />
```

Update AddSiteForm to pass edit props:
```svelte
<AddSiteForm bind:this={addSiteForm} onAdd={handleAdd} onUpdate={handleUpdate} {editingSite} open={addFormOpen} on:close={handleFormClose} />
```

Update `handleKeydown` Escape handler and Ctrl+N to clear editingSite:
```javascript
if (e.ctrlKey && e.key === 'n') {
  e.preventDefault();
  activeTab = 'sites';
  editingSite = null;
  addFormOpen = true;
  setTimeout(() => addSiteForm?.focusPathInput(), 0);
  return;
}
```

**Step 4: Run all frontend tests**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/App.svelte frontend/src/App.test.js
git commit -m "feat: wire up site edit in App.svelte"
```

---

### Task 8: Run all tests

**Step 1: Run all Go tests**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./... -v`
Expected: PASS

**Step 2: Run all frontend tests**

Run: `cd /home/andy/dev/andybarilla/rook/frontend && npx vitest run`
Expected: PASS

**Step 3: Verify build**

Run: `cd /home/andy/dev/andybarilla/rook && go build ./...`
Expected: Success
