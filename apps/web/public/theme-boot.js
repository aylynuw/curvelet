// Before the first paint: the saved light or dark theme, so the opening
// screen and the app start in the colours the person chose.
try {
  var saved = JSON.parse(localStorage.getItem('calculator.v1') || 'null');
  if (saved && (saved.theme === 'light' || saved.theme === 'dark')) document.documentElement.dataset.theme = saved.theme;
} catch (e) {
  // the system's theme, then
}
