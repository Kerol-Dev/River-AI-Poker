import { readSaved } from './hooks';
export type ThemeMode = 'system' | 'light' | 'dark';
export function savedTheme(): ThemeMode {
  const v = readSaved<string>('river.theme', 'system');
  return v === 'light' || v === 'dark' ? v : 'system';
}
// 'system' leaves the attribute off so the stylesheet follows macOS appearance.
export function applyTheme(mode: ThemeMode = savedTheme()) {
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}
export function setTheme(mode: ThemeMode) {
  try {
    localStorage.setItem('river.theme', JSON.stringify(mode));
  } catch {
    /* The choice still applies for this session. */
  }
  applyTheme(mode);
}
