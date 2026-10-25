// Apply the stored or device theme before the first paint to avoid a flash of
// the wrong colour scheme. This runs as a same-origin script to satisfy CSP.
(function () {
  var stored = null;

  try {
    stored = window.localStorage.getItem('retracify-theme');
  } catch (error) {
    // Storage can be unavailable; still respect the device setting.
  }

  var prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : prefersDark
        ? 'dark'
        : 'light';

  document.documentElement.dataset.theme = theme;

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0b1420' : '#0b5cad');
  }
})();
