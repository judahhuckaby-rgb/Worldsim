// Self-update: checks GitHub Releases and updates the app on Android (APK installer) and
// Windows (installed build auto-updates via electron-updater; the portable exe gets a download link).
import { Capacitor, registerPlugin } from '@capacitor/core';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const REPO = 'judahhuckaby-rgb/Worldsim';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

interface UpdaterPlugin {
  getVersion(): Promise<{ versionName: string; versionCode: number }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string }): Promise<{ started: boolean }>;
  addListener(event: 'progress', cb: (e: { percent: number }) => void): Promise<{ remove: () => void }>;
}
export const AppUpdater = registerPlugin<UpdaterPlugin>('AppUpdater');

export interface DesktopBridge {
  info(): Promise<{ version: string; portable: boolean; autoUpdate: boolean }>;
  installUpdate(): Promise<void>;
  checkUpdate(): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  onUpdateStatus(cb: (s: { state: string; version?: string; percent?: number; message?: string }) => void): void;
}
export function desktop(): DesktopBridge | null {
  return (window as any).desktop || null;
}

export type Platform = 'android' | 'windows-installed' | 'windows-portable' | 'web';

export async function platform(): Promise<Platform> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  const d = desktop();
  if (d) {
    try { const i = await d.info(); return i.portable || !i.autoUpdate ? 'windows-portable' : 'windows-installed'; } catch { return 'windows-portable'; }
  }
  return 'web';
}

/** Compare dotted versions: >0 when a is newer than b. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export interface ReleaseInfo {
  version: string;
  name: string;
  page: string;
  apk: string | null;
  setup: string | null;
  portable: string | null;
  published: string;
}

export async function fetchLatest(): Promise<ReleaseInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const assets: { name: string; browser_download_url: string }[] = d.assets || [];
    const find = (re: RegExp) => assets.find(a => re.test(a.name))?.browser_download_url || null;
    return {
      version: String(d.tag_name || '').replace(/^v/, ''),
      name: d.name || d.tag_name,
      page: d.html_url || RELEASES_URL,
      apk: find(/\.apk$/i),
      setup: find(/Setup.*\.exe$/i),
      portable: find(/Portable.*\.exe$/i),
      published: d.published_at || '',
    };
  } catch {
    return null;
  }
}

/** Returns the release if it is newer than this build. */
export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  const rel = await fetchLatest();
  if (!rel || !rel.version) return null;
  return cmpVersion(rel.version, APP_VERSION) > 0 ? rel : null;
}

export function openExternal(url: string): void {
  const d = desktop();
  if (d) { d.openExternal(url); return; }
  window.open(url, '_blank');
}
