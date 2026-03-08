//go:build windows

package registry

// withFileLock on Windows runs the function without file locking.
// Advisory locking will be added in a future release.
func (r *Registry) withFileLock(fn func() error) error {
	return fn()
}
