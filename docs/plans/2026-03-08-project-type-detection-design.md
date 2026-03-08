# Project Type Auto-Detection Design

## Problem

When a user adds a site, runtime version fields (PHP, Node) are only auto-filled if the project has a `.mise.toml` or `.tool-versions` file. Many projects specify their runtime requirements in `composer.json` (PHP) or `package.json` (Node) but lack mise config. Users must manually fill in these fields.

## Solution

Extend `RuntimeResolver.Detect()` to fall back to project config file parsing when mise doesn't provide a version for a given tool.

## Detection Priority

Mise config always wins. Project files only fill gaps.

1. **Mise** (`.mise.toml` / `.tool-versions`) — existing behavior, unchanged
2. **Project config files** — checked only for tools mise didn't return

| File | Tool | Version Source |
|------|------|----------------|
| `composer.json` | php | `require.php` constraint |
| `package.json` | node | `engines.node` constraint |

## Version Constraint Parsing

Project config files use version constraints (e.g., `^8.2`, `>=18`). We extract the base version:

- Strip leading operators: `^`, `~`, `>=`, `>`, `=`, `v`
- Take the first version from compound constraints (e.g., `^8.2 \|\| ^8.3` → `8.2`)
- Return empty string for unparseable input

Examples:
- `^8.2` → `8.2`
- `>=18` → `18`
- `~8.1.0` → `8.1.0`
- `v20.1` → `20.1`
- `8.3` → `8.3`
- `^8.2 || ^8.3` → `8.2`

## Implementation

All changes in `internal/mise/resolver.go`:

### New functions

- `detectFromProjectFiles(dir string) map[string]string` — reads `composer.json` and `package.json` from the given directory, extracts version constraints, returns a map of tool → version.
- `parseVersionConstraint(s string) string` — strips operator prefixes and extracts the base version number.

### Modified method

- `Detect(siteDir string)` — after calling `executor.Detect()`, calls `detectFromProjectFiles()` and merges results. Mise values are never overwritten.

### No changes to

- `Executor` interface (file detection is not a mise CLI operation)
- Frontend (`AddSiteForm.svelte` already calls `DetectSiteVersions` and displays "detected from project config")
- `app.go` (already delegates to the resolver)

## Testing

- **`parseVersionConstraint()`** — table-driven tests: `^8.2`, `>=18`, `~8.1`, `>8.0`, `v20.1`, `8.3`, `^8.2 || ^8.3`, empty string, garbage input
- **`detectFromProjectFiles()`** — temp directory tests:
  - `composer.json` with `require.php` → extracts PHP version
  - `package.json` with `engines.node` → extracts Node version
  - Both files present → returns both tools
  - No relevant files → returns empty map
- **`Detect()` integration** — mise returns partial results, project files fill gaps; mise results are never overwritten
