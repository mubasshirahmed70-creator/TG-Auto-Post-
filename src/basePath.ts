declare global {
  interface Window {
    __APP_BASE__?: string;
  }
}

export function getBasePath(): string {
  if (typeof window === 'undefined') return '';
  const injected = window.__APP_BASE__;
  if (injected && injected !== '/') {
    const cleaned = injected.replace(/^\/+|\/+$/g, '');
    return cleaned ? `/${cleaned}` : '';
  }
  // Fallback: detect single/multi-segment subpath if mounted outside root '/'
  const pathname = window.location.pathname || '/';
  if (pathname !== '/' && pathname !== '/index.html') {
    const cleaned = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    if (cleaned && cleaned !== '/') return cleaned;
  }
  return '';
}

export function withBase(path: string): string {
  if (!path) return path;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  const base = getBasePath();
  if (!base) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === base || normalized.startsWith(`${base}/`)) {
    return normalized;
  }
  return `${base}${normalized}`;
}
