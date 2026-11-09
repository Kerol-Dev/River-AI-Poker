// Which desktop River is running on. The browser preview reports "web".
export const platform: string =
  (typeof window !== 'undefined' &&
    (window as { river?: { platform?: string } }).river?.platform) ||
  'web';
export const isWindows = platform === 'win32';
export const deviceName = isWindows ? 'this PC' : 'your Mac';
export const osName = isWindows ? 'Windows' : 'macOS';
