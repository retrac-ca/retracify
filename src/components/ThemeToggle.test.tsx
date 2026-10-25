import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('offers night mode while the light theme is active', () => {
    const html = renderToStaticMarkup(
      <ThemeToggle theme="light" onToggle={() => {}} />,
    );

    expect(html).toContain('Night mode');
    expect(html).toContain('Switch to night mode');
  });

  it('offers day mode while the dark theme is active', () => {
    const html = renderToStaticMarkup(
      <ThemeToggle theme="dark" onToggle={() => {}} />,
    );

    expect(html).toContain('Day mode');
    expect(html).toContain('Switch to day mode');
  });
});
