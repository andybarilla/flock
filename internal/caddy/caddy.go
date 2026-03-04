package caddy

import (
	"encoding/json"
	"fmt"

	"github.com/andybarilla/flock/internal/registry"
)

type CaddyRunner interface {
	Run(cfgJSON []byte) error
	Stop() error
}

type UpstreamResolver interface {
	ResolveUpstream(site registry.Site) (string, error)
}

type Manager struct {
	runner   CaddyRunner
	resolver UpstreamResolver
	running  bool
}

func NewManager(runner CaddyRunner, resolver UpstreamResolver) *Manager {
	return &Manager{runner: runner, resolver: resolver}
}

func (m *Manager) Start(sites []registry.Site) error {
	cfgJSON, err := BuildConfig(sites, m.resolver)
	if err != nil {
		return fmt.Errorf("build config: %w", err)
	}
	if err := m.runner.Run(cfgJSON); err != nil {
		return fmt.Errorf("caddy run: %w", err)
	}
	m.running = true
	return nil
}

func (m *Manager) Reload(sites []registry.Site) error {
	return m.Start(sites)
}

func (m *Manager) Stop() error {
	if err := m.runner.Stop(); err != nil {
		return fmt.Errorf("caddy stop: %w", err)
	}
	m.running = false
	return nil
}

func BuildConfig(sites []registry.Site, resolver UpstreamResolver) ([]byte, error) {
	routes := make([]map[string]any, 0, len(sites))

	for _, site := range sites {
		upstream, err := resolver.ResolveUpstream(site)
		if err != nil {
			return nil, fmt.Errorf("resolve upstream for %q: %w", site.Domain, err)
		}

		var handler map[string]any
		if upstream != "" {
			handler = map[string]any{
				"handler": "reverse_proxy",
				"upstreams": []map[string]any{
					{"dial": upstream},
				},
			}
		} else {
			handler = map[string]any{
				"handler": "file_server",
				"root":    site.Path,
			}
		}

		route := map[string]any{
			"match": []map[string]any{
				{"host": []string{site.Domain}},
			},
			"handle": []map[string]any{handler},
		}
		routes = append(routes, route)
	}

	cfg := map[string]any{
		"admin": map[string]any{"disabled": true},
		"apps": map[string]any{
			"http": map[string]any{
				"servers": map[string]any{
					"flock": map[string]any{
						"listen": []string{":80", ":443"},
						"routes": routes,
					},
				},
			},
		},
	}

	return json.MarshalIndent(cfg, "", "  ")
}
