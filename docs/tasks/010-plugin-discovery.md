# Task 010: Plugin Discovery and Loading API

## Progress Summary

**Status**: Not Started

- [ ] Step 1: PluginsDir helper
- [ ] Step 2: Discovery package (PluginManifest & Scan)
- [ ] Step 3: JSON-RPC 2.0 client
- [ ] Step 4: ExternalPlugin adapter
- [ ] Step 5: Real process starter (os/exec)
- [ ] Step 6: Core integration
- [ ] Step 7: Integration test with real plugin executable
- [ ] Step 8: Final verification & cleanup

## Overview

Enable Flock to discover and load external plugins at startup. External plugins are standalone executables in `~/.config/flock/plugins/<name>/`, each with a `plugin.json` manifest. An `ExternalPlugin` adapter proxies the existing Plugin/RuntimePlugin/ServicePlugin interfaces to the subprocess over JSON-RPC 2.0 on stdin/stdout. The existing Manager sees no difference between built-in and external plugins.

## Current State Analysis

- Phase 1 and Phase 2 complete: all built-in plugins (SSL, PHP, databases) work
- Plugin system has `Plugin`, `RuntimePlugin`, `ServicePlugin` interfaces and a `Manager`
- All plugins are hard-coded in `core.go` — no dynamic loading exists
- `config` package provides platform-aware paths but no `PluginsDir`

## Target State

- `internal/discovery/` package that scans a plugins directory for manifests
- `internal/external/` package with ExternalPlugin adapter and JSON-RPC 2.0 client
- External plugins registered in core alongside built-in plugins
- Full lifecycle support: init, start, stop, upstream resolution, service management
- Integration test with a real plugin subprocess
- ~20 unit tests passing

## Implementation Steps

### Step 1: PluginsDir Helper

Add `PluginsDir()` to config package returning `~/.config/flock/plugins`.

**Files to create/modify:**
- `internal/config/paths.go` — Add PluginsDir function
- `internal/config/paths_test.go` — Add test

### Step 2: Discovery Package

Create `Scan()` function that reads plugin directories, parses `plugin.json` manifests, validates required fields, and checks executable existence.

**Files to create:**
- `internal/discovery/discovery.go` — PluginManifest type, Scan(), loadManifest(), validate()
- `internal/discovery/discovery_test.go` — 7 tests: empty dir, nonexistent dir, valid plugin, missing manifest, missing executable, missing fields, multiple plugins

### Step 3: JSON-RPC 2.0 Client

Create a JSON-RPC 2.0 client that communicates over stdin/stdout pipes. Newline-delimited JSON, one request/response per line.

**Files to create:**
- `internal/external/jsonrpc.go` — rpcRequest, rpcResponse, rpcError, rpcClient, Call()
- `internal/external/jsonrpc_test.go` — 3 tests: successful call, error response, nil result

### Step 4: ExternalPlugin Adapter

Create `ExternalPlugin` struct that implements Plugin, RuntimePlugin, and ServicePlugin by proxying to subprocess via JSON-RPC. Uses `ProcessStarter` interface for testability.

**Files to create:**
- `internal/external/plugin.go` — Process interface, ProcessStarter type, ExternalPlugin struct
- `internal/external/plugin_test.go` — 6+ tests: ID/Name, Init/Start/Stop lifecycle, Handles, UpstreamFor, ServiceStatus, Init error

### Step 5: Real Process Starter

Create `ExecProcessStarter` using `os/exec` to launch real subprocesses.

**Files to create:**
- `internal/external/process.go` — execProcess struct, ExecProcessStarter function
- `internal/external/process_test.go` — 1 test with shell script subprocess

### Step 6: Core Integration

Add `PluginsDir` to Config, scan for external plugins in `NewCore()`, register them after built-in plugins. Update `app.go` to pass `config.PluginsDir()`.

**Files to modify:**
- `internal/core/core.go` — Add PluginsDir to Config, scan and register external plugins
- `internal/core/core_test.go` — Add TestExternalPluginsRegistered
- `app.go` — Pass PluginsDir to core.Config

### Step 7: Integration Test with Real Plugin Executable

Build a tiny Go test fixture that speaks JSON-RPC and verify the full lifecycle: discovery -> load -> init -> start -> handles -> upstream -> service status -> stop.

**Files to create:**
- `internal/external/testdata/echo-plugin.go` — Minimal JSON-RPC plugin
- `internal/external/plugin_test.go` — Add TestExternalPluginIntegration

### Step 8: Final Verification & Cleanup

Run full test suite, go vet, update roadmap.

**Files to modify:**
- `docs/ROADMAP.md` — Mark plugin discovery as complete
- `docs/tasks/010-plugin-discovery.md` — Update progress

## Acceptance Criteria

### Functional Requirements

- [ ] External plugins discovered from `~/.config/flock/plugins/` at startup
- [ ] `plugin.json` manifest validated (id, name, version, executable, capabilities)
- [ ] Invalid plugins logged and skipped (non-fatal)
- [ ] External plugins support RuntimePlugin (handles, upstreamFor)
- [ ] External plugins support ServicePlugin (serviceStatus, startService, stopService)
- [ ] External plugins appear in Manager.Plugins() alongside built-ins
- [ ] Built-in plugins have priority for upstream resolution

### Technical Requirements

- [ ] All tests pass (TDD — tests written before implementation)
- [ ] No breaking changes to existing functionality
- [ ] `go test ./...` passes clean
- [ ] `go vet ./...` passes clean
- [ ] No new external dependencies (stdlib only)

## Files Involved

### New Files

- `internal/discovery/discovery.go`
- `internal/discovery/discovery_test.go`
- `internal/external/jsonrpc.go`
- `internal/external/jsonrpc_test.go`
- `internal/external/plugin.go`
- `internal/external/plugin_test.go`
- `internal/external/process.go`
- `internal/external/process_test.go`
- `internal/external/testdata/echo-plugin.go`

### Modified Files

- `internal/config/paths.go`
- `internal/config/paths_test.go`
- `internal/core/core.go`
- `internal/core/core_test.go`
- `app.go`

## Notes

- Design doc: `docs/plans/2026-03-04-plugin-discovery-design.md`
- Implementation plan: `docs/plans/2026-03-04-plugin-discovery.md`
- Architecture: `docs/plans/2026-03-03-flock-core-design.md`
- Reference pattern: built-in plugins in `internal/php/`, `internal/ssl/`, `internal/databases/`

## Dependencies

- Task 009 (flock-databases) — complete
- Task 007 (Core wiring) — complete
