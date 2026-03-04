# Error UX Design

**Date:** 2026-03-04
**Roadmap item:** Error UX (dismissable banners, friendly messages, loading states)
**Scope:** Frontend-only changes (no backend modifications)

## Current State

- Errors display as a static `alert alert-error` banner that persists until the next operation
- No manual dismissal, no auto-dismiss
- No success/info feedback after operations
- No loading states — users can't tell if an operation is in progress
- Buttons remain clickable during async operations (allows double-clicks)
- No skeleton loading for initial data fetch
- Error messages are generic: `"Failed to X: {raw backend message}"`
- DaisyUI v5.5 is integrated with `toast`, `loading`, `skeleton`, and `modal` components available but unused

## Design

### 1. Notification Store

**File:** `src/lib/notifications.js`

A Svelte writable store holding an array of notification objects:

```js
{ id, type: 'success'|'error'|'info'|'warning', message, dismissable: true, timeout }
```

Helper functions:
- `notifySuccess(message)` — pushes success notification, auto-dismisses after 3 seconds
- `notifyError(message)` — pushes error notification, auto-dismisses after 8 seconds, manually dismissable
- `notifyInfo(message)` — pushes info notification, auto-dismisses after 3 seconds
- `dismiss(id)` — manually removes a notification by ID

Each notification gets a unique ID (counter or `Date.now()`) for tracking.

### 2. Toast Container Component

**File:** `src/lib/ToastContainer.svelte`

Renders notifications from the store as DaisyUI toasts:

- Positioned bottom-right using `toast toast-end toast-bottom`
- Each notification is an `alert alert-{type}` inside the toast container
- X button for manual dismissal
- Auto-removes after timeout via `setTimeout` (set on mount, cleared on dismiss)
- Svelte `transition:fade` for animate in/out
- Mounted once in `App.svelte` at the root level

### 3. Loading States

**Operation buttons (Start/Stop Database, Remove Site):**
- Local `loading` boolean per operation
- While loading: button shows DaisyUI `loading loading-spinner` class + `btn-disabled`
- Prevents double-clicks during async operations

**AddSiteForm:**
- `submitting` boolean flag
- While submitting: submit button disabled with spinner, form inputs disabled
- On success: clear form, push success toast
- On error: push error toast, re-enable form

**Pattern:**
```svelte
let loading = false;
async function handleAction() {
  loading = true;
  try {
    await BackendCall();
    notifySuccess('Done!');
  } catch (e) {
    notifyError(friendlyError(e.message || String(e)));
  } finally {
    loading = false;
  }
}
```

### 4. Skeleton Loading

For initial page load while sites and services are fetched:

**SiteList:** 3 skeleton rows matching the table column layout using DaisyUI `skeleton` class (pulsing gray bars where domain, path, PHP version, and action columns would be).

**ServiceList:** 2-3 skeleton rows matching the service table layout.

Skeletons only show on initial load, not on subsequent refreshes (to avoid flicker). Use a `loaded` flag that starts `false` and becomes `true` after the first successful data fetch.

### 5. Friendly Error Messages

**File:** `src/lib/errorMessages.js`

A `friendlyError(raw)` function that pattern-matches common backend error strings and returns user-friendly messages:

| Backend Pattern | Friendly Message |
|---|---|
| `path "..." is not a directory` | `The selected path is not a valid directory.` |
| `domain "..." is already registered` | `A site with domain "..." already exists.` |
| `domain "..." not found` | `Could not find site "...".` |
| Unrecognized errors | Original message (passthrough) |

No backend changes needed — this is pure frontend string mapping.

## File Changes

### New files
- `src/lib/notifications.js` — notification store and helper functions
- `src/lib/ToastContainer.svelte` — toast rendering component
- `src/lib/errorMessages.js` — friendly error message mapper

### Modified files
- `App.svelte` — mount ToastContainer, replace `error` variable with notification store, add initial loading state
- `AddSiteForm.svelte` — replace local error with notification store, add submitting state, show success toast
- `SiteList.svelte` — add skeleton loading for initial load, loading state on remove button
- `ServiceList.svelte` — add skeleton loading, loading state on start/stop buttons

### Removed patterns
- Inline `alert alert-error` banners replaced by toast notifications
- Local `error` string variables replaced by notification store calls
