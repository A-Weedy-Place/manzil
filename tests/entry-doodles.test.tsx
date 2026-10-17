// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import EntryDoodles from '../src/components/EntryDoodles';

afterEach(cleanup);

describe('decorative entry scenery', () => {
  it('keeps every clipping reference local and unique across mounted scenes', () => {
    const { container } = render(<><EntryDoodles paused={false} /><EntryDoodles paused /></>);
    const ids = [...container.querySelectorAll('clipPath')].map(node => node.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scene of container.querySelectorAll('.entry-doodles')) {
      const sceneIds = new Set([...scene.querySelectorAll('clipPath')].map(node => node.id));
      for (const clipped of scene.querySelectorAll('[clip-path]')) {
        const reference = clipped.getAttribute('clip-path')!.slice(5, -1);
        expect(sceneIds.has(reference)).toBe(true);
      }
    }
  });

  it('stays outside accessibility and input navigation while accepting pause changes', () => {
    const { container, rerender } = render(<EntryDoodles paused={false} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('button,a,input,[tabindex],img,animate,animateMotion')).toHaveLength(0);
    for (const illustration of container.querySelectorAll('svg')) expect(illustration.getAttribute('focusable')).toBe('false');
    const scene = container.firstElementChild;
    rerender(<EntryDoodles paused />);
    expect(container.firstElementChild).toBe(scene);
    expect(scene?.getAttribute('data-paused')).toBe('true');
  });
});
