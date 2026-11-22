// Generates Android launcher icons and splash screens from build/icon.png (keeps each file's size).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const dims = f => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
(async () => {
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.png')).toString('base64');
  const fg = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'build', 'icon-fg.png')).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of walk(res).filter(f => f.endsWith('.png'))) {
    const [w, h] = dims(f);
    const kind = path.basename(f).replace('.png', '');
    const data = await page.evaluate(async ({ w, h, kind, icon, fg }) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      if (kind === 'splash') {
        x.fillStyle = '#0d1424'; x.fillRect(0, 0, w, h);
        const s = Math.floor(Math.min(w, h) * 0.42 / 32) * 32 || 32;
        x.drawImage(await load(fg), (w - s) / 2, (h - s) / 2, s, s);
      } else if (kind === 'ic_launcher_foreground') {
        x.drawImage(await load(fg), 0, 0, w, h);
      } else if (kind === 'ic_launcher_round') {
        x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); x.clip();
        x.drawImage(await load(icon), 0, 0, w, h);
      } else {
        x.drawImage(await load(icon), 0, 0, w, h);
      }
      return c.toDataURL('image/png').split(',')[1];
    }, { w, h, kind, icon, fg });
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
  }
  const bg = path.join(res, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(bg, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#13224A</color>\n</resources>\n');
  await browser.close();
  console.log('android assets updated');
})();
