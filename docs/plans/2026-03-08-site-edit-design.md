# Site Edit Feature Design

## Overview

Add edit functionality for sites across UI (table + card views) and CLI, reusing the existing AddSiteForm modal in edit mode.

## Editable Fields

- Path, PHP Version, Node Version, TLS
- Domain is **not editable** (displayed but disabled — it's the site identifier)

## Backend Changes

### Registry (`internal/registry/registry.go`)

`Update()` already exists — no changes needed.

### Core (`internal/core/core.go`)

Add `UpdateSite(domain string, site registry.Site) error` — calls `registry.Update`, which triggers Caddy reload via existing `onChange` listener.

### Wails Binding (`app.go`)

Add `UpdateSite(domain, path, phpVersion, nodeVersion string, tls bool) error` — mirrors `AddSite` signature but updates instead of creates.

### CLI (`internal/cli/sites.go`)

Add `sites edit <domain>` command with flags `--path`, `--php`, `--node`, `--tls`. Only provided flags are updated.

## Frontend Changes

### AddSiteForm.svelte — Edit Mode

- Accept optional `editingSite` prop (null = add mode, site object = edit mode)
- When editing: pre-populate all fields, disable domain input, change button text to "Update Site", change title to "Edit Site"
- Path browsing and auto-detection still work (user might move a project)

### SiteList.svelte — Table View

Add edit button (pencil icon) in Actions column next to remove button.

### SiteCard.svelte — Card View

Add edit button next to existing remove button.

### App.svelte

Add `handleEdit(site)` that opens AddSiteForm in edit mode, and `handleUpdate(site)` that calls the `UpdateSite` binding and refreshes.

## Keyboard Shortcut

Ctrl+Enter to submit (already exists in AddSiteForm, works for both modes).
