import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the location controls, legal links, and loading state', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Grand Falls');
    expect(html).toContain('Use my location');
    expect(html).toContain('Switch to night mode');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('Loading weather');
  });
});
