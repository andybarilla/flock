import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AddSiteForm from './AddSiteForm.svelte';

describe('AddSiteForm', () => {
  it('is collapsed by default', () => {
    const { container } = render(AddSiteForm);
    const collapse = container.querySelector('.collapse');
    expect(collapse).toBeTruthy();
    // The checkbox controlling collapse should be unchecked
    const checkbox = collapse.querySelector('input[type="checkbox"]');
    expect(checkbox.checked).toBe(false);
  });

  it('expands when the collapse title is clicked', async () => {
    const { container } = render(AddSiteForm);
    const checkbox = container.querySelector('.collapse input[type="checkbox"]');
    await fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('has 3 logical rows: Path+Domain, PHP+Node, TLS+Submit', () => {
    const { container } = render(AddSiteForm);
    const rows = container.querySelectorAll('.collapse-content .form-row');
    expect(rows.length).toBe(3);
  });

  it('row 1 contains Path and Domain fields', () => {
    const { container } = render(AddSiteForm);
    const row1 = container.querySelectorAll('.collapse-content .form-row')[0];
    expect(row1.textContent).toContain('Path');
    expect(row1.textContent).toContain('Domain');
  });

  it('row 2 contains PHP Version and Node Version fields', () => {
    const { container } = render(AddSiteForm);
    const row2 = container.querySelectorAll('.collapse-content .form-row')[1];
    expect(row2.textContent).toContain('PHP Version');
    expect(row2.textContent).toContain('Node Version');
  });

  it('row 3 contains TLS checkbox and Add Site button', () => {
    const { container } = render(AddSiteForm);
    const row3 = container.querySelectorAll('.collapse-content .form-row')[2];
    expect(row3.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(row3.textContent).toContain('TLS');
    expect(row3.textContent).toContain('Add Site');
  });

  it('auto-collapses after successful submission', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const { container, getByPlaceholderText } = render(AddSiteForm, {
      props: { onAdd },
    });
    // Expand the form
    const checkbox = container.querySelector('.collapse input[type="checkbox"]');
    await fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    // Fill required fields
    const pathInput = getByPlaceholderText('/home/user/projects/myapp');
    const domainInput = getByPlaceholderText('myapp.test');
    await fireEvent.input(pathInput, { target: { value: '/tmp/app' } });
    await fireEvent.input(domainInput, { target: { value: 'app.test' } });
    // Submit
    const form = container.querySelector('form');
    await fireEvent.submit(form);
    // Wait for async handler
    await vi.waitFor(() => {
      expect(checkbox.checked).toBe(false);
    });
  });
});
