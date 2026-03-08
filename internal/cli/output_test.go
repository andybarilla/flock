package cli_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/andybarilla/flock/internal/cli"
)

func TestFormatTable(t *testing.T) {
	var buf bytes.Buffer
	headers := []string{"NAME", "VALUE"}
	rows := [][]string{
		{"domain", "myapp.test"},
		{"path", "/home/user/myapp"},
	}

	cli.FormatTable(&buf, headers, rows)
	out := buf.String()

	if !bytes.Contains([]byte(out), []byte("NAME")) {
		t.Errorf("table missing header NAME: %s", out)
	}
	if !bytes.Contains([]byte(out), []byte("myapp.test")) {
		t.Errorf("table missing value myapp.test: %s", out)
	}
}

func TestFormatJSON(t *testing.T) {
	var buf bytes.Buffer
	data := []map[string]string{{"domain": "myapp.test"}}

	if err := cli.FormatJSON(&buf, data); err != nil {
		t.Fatalf("FormatJSON: %v", err)
	}

	var result []map[string]string
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if result[0]["domain"] != "myapp.test" {
		t.Errorf("domain = %q, want myapp.test", result[0]["domain"])
	}
}

func TestFormatTableAlignment(t *testing.T) {
	var buf bytes.Buffer
	headers := []string{"SHORT", "LONG"}
	rows := [][]string{
		{"a", "abcdef"},
		{"ab", "xy"},
	}

	cli.FormatTable(&buf, headers, rows)
	out := buf.String()

	if len(out) == 0 {
		t.Error("expected non-empty output")
	}
}
