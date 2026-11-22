// Update notifications and the update dialog.
import type { UI } from './ui';
import {
  APP_VERSION, AppUpdater, RELEASES_URL, ReleaseInfo, checkForUpdate, desktop, openExternal, platform, Platform,
} from '../update';

export class UpdateUI {
  ui: UI;
  save: () => Promise<void>;
  pill: HTMLButtonElement;
  plat: Platform = 'web';
  latest: ReleaseInfo | null = null;
  desktopState: { state: string; version?: string; percent?: number; message?: string } | null = null;
  busy = false;

  constructor(ui: UI, root: HTMLElement, save: () => Promise<void>) {
    this.ui = ui;
    this.save = save;
    this.pill = document.createElement('button');
    this.pill.id = 'updatePill';
    this.pill.className = 'hidden';
    this.pill.onclick = () => this.openDialog(false);
    root.append(this.pill);
  }

  async start(): Promise<void> {
    this.plat = await platform();
    const d = desktop();
    if (d) d.onUpdateStatus(s => { this.desktopState = s; this.refreshPill(); if (this.ui.modalOpen && this.ui.modal.querySelector('#upd')) this.openDialog(false); });
    setTimeout(() => this.check(false), 6000);
    setInterval(() => this.check(false), 3 * 60 * 60 * 1000);
  }

  async check(manual: boolean): Promise<void> {
    const rel = await checkForUpdate();
    this.latest = rel;
    this.refreshPill();
    if (manual) this.openDialog(false, true);
    else if (rel && this.plat !== 'windows-installed') this.ui.toast(`🔄 WorldSim Ages ${rel.version} is available — tap the update button at the top`);
  }

  refreshPill(): void {
    const s = this.desktopState;
    let text = '';
    if (s && s.state === 'downloading') text = `⬇ Updating… ${s.percent ?? 0}%`;
    else if (s && s.state === 'ready') text = `✅ Update ready — restart`;
    else if (this.latest) text = `🔄 Update ${this.latest.version}`;
    this.pill.textContent = text;
    this.pill.classList.toggle('hidden', !text);
  }

  openDialog(force: boolean, checked = false): void {
    if (force) { this.ui.openModal('<h1>🔄 Updates</h1><div class="sub">Checking GitHub for a new version…</div>'); this.check(true); return; }
    const rel = this.latest;
    const s = this.desktopState;
    let body = '';
    let actions = '';
    if (!rel && !(s && s.state === 'ready')) {
      body = `<div class="sub">You have the latest version (${APP_VERSION}).${checked ? '' : ''}</div>`;
      actions = `<button class="btn" data-u="page">Open releases page</button>`;
    } else {
      const ver = rel ? rel.version : s && s.version ? s.version : '';
      body = `<div class="sub">Version <b>${ver}</b> is available — you have ${APP_VERSION}. Your autosave is kept.</div>`;
      switch (this.plat) {
        case 'android':
          body += `<div class="sub" id="updStatus">Downloads the new APK and opens Android's installer. The first time, Android asks you to allow installs from this app.</div>`;
          actions = `<button class="btn primary" data-u="apk">⬇ Download & install</button><button class="btn" data-u="page">Release notes</button>`;
          break;
        case 'windows-installed':
          if (s && s.state === 'ready') { body += `<div class="sub">The update has been downloaded.</div>`; actions = `<button class="btn primary" data-u="restart">Restart & update</button>`; }
          else if (s && s.state === 'downloading') body += `<div class="sub">Downloading in the background… ${s.percent ?? 0}%</div>`;
          else { body += `<div class="sub">The update downloads in the background and installs when you restart.</div>`; actions = `<button class="btn" data-u="recheck">Check now</button>`; }
          break;
        case 'windows-portable':
          body += `<div class="sub">The portable version can't replace itself while running. Download the new exe, or switch to the installer once — it updates itself automatically from then on.</div>`;
          actions = `<button class="btn primary" data-u="portable">⬇ Download new version</button>${rel && rel.setup ? '<button class="btn" data-u="setup">Get the self-updating installer</button>' : ''}`;
          break;
        default:
          actions = `<button class="btn primary" data-u="page">Open release page</button>`;
      }
    }
    this.ui.openModal(`<div id="upd"><h1>🔄 Updates</h1>${body}<div class="btns">${actions}</div></div>`);
    this.ui.modal.querySelectorAll<HTMLElement>('[data-u]').forEach(b => b.onclick = () => this.action(b.dataset.u!));
  }

  private status(msg: string): void {
    const el = this.ui.modal.querySelector('#updStatus');
    if (el) el.innerHTML = msg;
  }

  async action(a: string): Promise<void> {
    const rel = this.latest;
    switch (a) {
      case 'page': openExternal(rel ? rel.page : RELEASES_URL); break;
      case 'portable': openExternal((rel && rel.portable) || RELEASES_URL); break;
      case 'setup': openExternal((rel && rel.setup) || RELEASES_URL); break;
      case 'recheck': { const d = desktop(); if (d) d.checkUpdate(); break; }
      case 'restart': { await this.save().catch(() => {}); const d = desktop(); if (d) d.installUpdate(); break; }
      case 'apk': {
        if (!rel || !rel.apk || this.busy) return;
        try {
          const can = await AppUpdater.canInstall();
          if (!can.allowed) {
            this.status('Allow <b>Install unknown apps</b> for WorldSim Ages in the screen that opens, then come back and tap Download again.');
            await AppUpdater.openInstallSettings();
            return;
          }
          this.busy = true;
          await this.save().catch(() => {});
          const sub = await AppUpdater.addListener('progress', e => this.status(`Downloading… ${e.percent}%`));
          this.status('Downloading…');
          await AppUpdater.downloadAndInstall({ url: rel.apk });
          sub.remove();
          this.status('Opening the installer — tap <b>Update</b> to finish.');
        } catch (e) {
          this.status(`Update failed: ${(e as Error).message || e}. You can also download it from the release page.`);
        } finally {
          this.busy = false;
        }
        break;
      }
    }
  }
}
