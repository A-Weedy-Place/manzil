// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HeaderLanguage from '../src/components/HeaderLanguage';
import type { Language } from '../shared/speech';

afterEach(cleanup);
function Controls() {
  const [language, setLanguage] = useState<Language>('en');
  return <><HeaderLanguage value={language} onChange={setLanguage} /><button>Next control</button></>;
}
it('offers a styled language menu with keyboard selection, checked choice and focus return', async () => {
  const user = userEvent.setup(); render(<Controls />);
  const trigger = screen.getByRole('button', { name: 'Language' });
  trigger.focus(); await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'English' }));
  await user.keyboard('{ArrowUp}{Enter}');
  expect(screen.queryByRole('menu')).toBeNull(); expect(trigger.textContent).toBe('اردو'); expect(document.activeElement).toBe(trigger);
  await user.click(trigger); await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it('dismisses the menu on outside click or Tab without trapping keyboard focus', async () => {
  const user = userEvent.setup(); render(<Controls />);
  await user.click(screen.getByRole('button', { name: 'Language' }));
  await user.tab(); await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next control' }));
  await user.click(screen.getByRole('button', { name: 'Language' }));
  await user.tab({ shift: true });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Language' }));
  await user.click(screen.getByRole('button', { name: 'Language' }));
  await user.click(screen.getByRole('button', { name: 'Next control' }));
  expect(screen.queryByRole('menu')).toBeNull();
});
