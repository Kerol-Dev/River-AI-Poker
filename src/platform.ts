// Which desktop River is running on. The browser preview reports "web".
export const platform: string =
  (typeof window !== 'undefined' &&
    (window as { river?: { platform?: string } }).river?.platform) ||
  'web';
export const isWindows = platform === 'win32';
export const deviceName = isWindows
  ? 'this PC'
  : platform === 'darwin'
    ? 'your Mac'
    : 'this computer';
export const osName = isWindows ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Desktop';
