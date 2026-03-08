# Project Type Auto-Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect PHP and Node runtime versions from `composer.json` and `package.json` when mise config is absent.

**Architecture:** Extend `RuntimeResolver.Detect()` in `internal/mise/resolver.go` with file-based fallback detection. Mise results always take priority. Two new unexported functions handle file parsing and version constraint extraction.

**Tech Stack:** Go, `encoding/json`, `os`, `path/filepath`, `regexp`, `testing`

---

### Task 1: `parseVersionConstraint` — tests

**Files:**
- Modify: `internal/mise/resolver_test.go`

**Step 1: Write failing tests for `parseVersionConstraint`**

Add this table-driven test at the end of `resolver_test.go`:

```go
func TestParseVersionConstraint(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"^8.2", "8.2"},
		{">=18", "18"},
		{"~8.1.0", "8.1.0"},
		{">8.0", "8.0"},
		{"v20.1", "20.1"},
		{"8.3", "8.3"},
		{"^8.2 || ^8.3", "8.2"},
		{"=8.2", "8.2"},
		{"", ""},
		{"not-a-version", ""},
		{"*", ""},
		{">=8.2 <9.0", "8.2"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseVersionConstraint(tt.input)
			if result != tt.expected {
				t.Fatalf("parseVersionConstraint(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -run TestParseVersionConstraint -v`
Expected: FAIL — `parseVersionConstraint` undefined

**Step 3: Implement `parseVersionConstraint`**

Add to `internal/mise/resolver.go` (add `"regexp"` to imports):

```go
// parseVersionConstraint extracts a base version number from a version
// constraint string (e.g., "^8.2" → "8.2", ">=18" → "18").
// For compound constraints (e.g., "^8.2 || ^8.3"), returns the first version.
// Returns empty string if no version can be extracted.
func parseVersionConstraint(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// For compound constraints, take the first part
	if idx := strings.Index(s, "||"); idx != -1 {
		s = strings.TrimSpace(s[:idx])
	}
	// For space-separated constraints (e.g., ">=8.2 <9.0"), take the first part
	if idx := strings.Index(s, " "); idx != -1 {
		s = strings.TrimSpace(s[:idx])
	}
	// Strip leading operators and 'v' prefix
	re := regexp.MustCompile(`^[~^>=<v]+`)
	s = re.ReplaceAllString(s, "")
	// Validate it looks like a version number
	if matched, _ := regexp.MatchString(`^\d+(\.\d+)*$`, s); !matched {
		return ""
	}
	return s
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -run TestParseVersionConstraint -v`
Expected: PASS

**Step 5: Commit**

```
git add internal/mise/resolver.go internal/mise/resolver_test.go
git commit -m "feat: add parseVersionConstraint for extracting versions from constraints"
```

---

### Task 2: `detectFromProjectFiles` — tests

**Files:**
- Modify: `internal/mise/resolver_test.go`
- Modify: `internal/mise/resolver.go`

**Step 1: Write failing tests for `detectFromProjectFiles`**

Add to `resolver_test.go` (add `"os"` and `"path/filepath"` to imports):

```go
func TestDetectFromProjectFiles_ComposerJSON(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {
			"php": "^8.2",
			"laravel/framework": "^11.0"
		}
	}`), 0644)

	result := detectFromProjectFiles(dir)
	if result["php"] != "8.2" {
		t.Fatalf("expected php 8.2, got %q", result["php"])
	}
	if _, ok := result["node"]; ok {
		t.Fatal("expected no node entry")
	}
}

func TestDetectFromProjectFiles_PackageJSON(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"name": "my-app",
		"engines": {
			"node": ">=18"
		}
	}`), 0644)

	result := detectFromProjectFiles(dir)
	if result["node"] != "18" {
		t.Fatalf("expected node 18, got %q", result["node"])
	}
	if _, ok := result["php"]; ok {
		t.Fatal("expected no php entry")
	}
}

func TestDetectFromProjectFiles_BothFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {"php": "^8.3"}
	}`), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"engines": {"node": "20"}
	}`), 0644)

	result := detectFromProjectFiles(dir)
	if result["php"] != "8.3" {
		t.Fatalf("expected php 8.3, got %q", result["php"])
	}
	if result["node"] != "20" {
		t.Fatalf("expected node 20, got %q", result["node"])
	}
}

func TestDetectFromProjectFiles_NoFiles(t *testing.T) {
	dir := t.TempDir()
	result := detectFromProjectFiles(dir)
	if len(result) != 0 {
		t.Fatalf("expected empty map, got %v", result)
	}
}

func TestDetectFromProjectFiles_NoVersionInComposer(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {
			"laravel/framework": "^11.0"
		}
	}`), 0644)

	result := detectFromProjectFiles(dir)
	if _, ok := result["php"]; ok {
		t.Fatal("expected no php entry when composer.json has no php requirement")
	}
}

func TestDetectFromProjectFiles_NoEnginesInPackageJSON(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"name": "my-app",
		"version": "1.0.0"
	}`), 0644)

	result := detectFromProjectFiles(dir)
	if _, ok := result["node"]; ok {
		t.Fatal("expected no node entry when package.json has no engines")
	}
}

func TestDetectFromProjectFiles_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`not json`), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`not json`), 0644)

	result := detectFromProjectFiles(dir)
	if len(result) != 0 {
		t.Fatalf("expected empty map for invalid JSON, got %v", result)
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -run TestDetectFromProjectFiles -v`
Expected: FAIL — `detectFromProjectFiles` undefined

**Step 3: Implement `detectFromProjectFiles`**

Add to `internal/mise/resolver.go` (add `"os"` and `"path/filepath"` to imports):

```go
// detectFromProjectFiles checks for composer.json and package.json in the
// given directory and extracts runtime version requirements.
// Returns a map of tool name → version (e.g., {"php": "8.2", "node": "18"}).
func detectFromProjectFiles(dir string) map[string]string {
	result := map[string]string{}

	// Check composer.json for PHP version
	if data, err := os.ReadFile(filepath.Join(dir, "composer.json")); err == nil {
		var composer struct {
			Require map[string]string `json:"require"`
		}
		if json.Unmarshal(data, &composer) == nil {
			if constraint, ok := composer.Require["php"]; ok {
				if v := parseVersionConstraint(constraint); v != "" {
					result["php"] = v
				}
			}
		}
	}

	// Check package.json for Node version
	if data, err := os.ReadFile(filepath.Join(dir, "package.json")); err == nil {
		var pkg struct {
			Engines map[string]string `json:"engines"`
		}
		if json.Unmarshal(data, &pkg) == nil {
			if constraint, ok := pkg.Engines["node"]; ok {
				if v := parseVersionConstraint(constraint); v != "" {
					result["node"] = v
				}
			}
		}
	}

	return result
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -run TestDetectFromProjectFiles -v`
Expected: PASS

**Step 5: Commit**

```
git add internal/mise/resolver.go internal/mise/resolver_test.go
git commit -m "feat: add detectFromProjectFiles for composer.json and package.json"
```

---

### Task 3: Wire fallback into `Detect()` — tests

**Files:**
- Modify: `internal/mise/resolver_test.go`
- Modify: `internal/mise/resolver.go`

**Step 1: Write failing tests for `Detect()` fallback behavior**

Add to `resolver_test.go`:

```go
func TestDetect_FallsBackToProjectFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {"php": "^8.2"}
	}`), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"engines": {"node": ">=20"}
	}`), 0644)

	// Mise available but returns nothing for this directory
	stub := &stubExecutor{
		available: true,
		version:   "1.0.0",
		detectOut: map[string]string{},
	}
	r := NewWithExecutor(stub)

	result, err := r.Detect(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["php"] != "8.2" {
		t.Fatalf("expected php 8.2 from composer.json fallback, got %q", result["php"])
	}
	if result["node"] != "20" {
		t.Fatalf("expected node 20 from package.json fallback, got %q", result["node"])
	}
}

func TestDetect_MiseWinsOverProjectFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {"php": "^8.2"}
	}`), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"engines": {"node": ">=18"}
	}`), 0644)

	// Mise returns specific versions — these must win
	stub := &stubExecutor{
		available: true,
		version:   "1.0.0",
		detectOut: map[string]string{
			"php":  "8.3.0",
			"node": "20.0.0",
		},
	}
	r := NewWithExecutor(stub)

	result, err := r.Detect(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["php"] != "8.3.0" {
		t.Fatalf("expected mise php 8.3.0 to win, got %q", result["php"])
	}
	if result["node"] != "20.0.0" {
		t.Fatalf("expected mise node 20.0.0 to win, got %q", result["node"])
	}
}

func TestDetect_MisePartialFallback(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{
		"engines": {"node": ">=18"}
	}`), 0644)

	// Mise returns php but not node
	stub := &stubExecutor{
		available: true,
		version:   "1.0.0",
		detectOut: map[string]string{
			"php": "8.3.0",
		},
	}
	r := NewWithExecutor(stub)

	result, err := r.Detect(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["php"] != "8.3.0" {
		t.Fatalf("expected mise php 8.3.0, got %q", result["php"])
	}
	if result["node"] != "18" {
		t.Fatalf("expected node 18 from package.json fallback, got %q", result["node"])
	}
}

func TestDetect_FallsBackWhenMiseUnavailable(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "composer.json"), []byte(`{
		"require": {"php": "^8.2"}
	}`), 0644)

	stub := &stubExecutor{
		available: false,
	}
	r := NewWithExecutor(stub)

	result, err := r.Detect(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["php"] != "8.2" {
		t.Fatalf("expected php 8.2 from composer.json when mise unavailable, got %q", result["php"])
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -run "TestDetect_(FallsBack|MiseWins|MisePartial)" -v`
Expected: FAIL — the new tests fail because `Detect()` doesn't call `detectFromProjectFiles` yet

**Step 3: Update `Detect()` to merge project file results**

Replace the `Detect` method in `internal/mise/resolver.go`:

```go
// Detect returns tool versions configured for a site directory.
// It checks mise first (if available), then falls back to project config
// files (composer.json, package.json) to fill any gaps.
func (r *RuntimeResolver) Detect(siteDir string) (map[string]string, error) {
	var result map[string]string

	ok, _ := r.Available()
	if ok {
		var err error
		result, err = r.executor.Detect(siteDir)
		if err != nil {
			result = map[string]string{}
		}
	} else {
		result = map[string]string{}
	}

	// Fill gaps from project config files
	for tool, version := range detectFromProjectFiles(siteDir) {
		if _, exists := result[tool]; !exists {
			result[tool] = version
		}
	}

	return result, nil
}
```

**Step 4: Run all tests to verify they pass**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./internal/mise/ -v`
Expected: ALL PASS (including existing tests)

**Step 5: Commit**

```
git add internal/mise/resolver.go internal/mise/resolver_test.go
git commit -m "feat: wire project file detection fallback into Detect()"
```

---

### Task 4: Final verification and roadmap update

**Files:**
- Modify: `docs/ROADMAP.md`

**Step 1: Run full test suite**

Run: `cd /home/andy/dev/andybarilla/rook && go test ./...`
Expected: ALL PASS

**Step 2: Update roadmap**

Add a new item under "Phase 5 — Runtime Management" (or "Future — Potential") in `docs/ROADMAP.md`:

```markdown
- [x] Project type auto-detection (composer.json, package.json fallback) — See: docs/plans/2026-03-08-project-type-detection-design.md
```

**Step 3: Commit**

```
git add docs/ROADMAP.md
git commit -m "docs: update roadmap with project type auto-detection"
```
