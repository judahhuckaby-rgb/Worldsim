// Renders the pixel-art app icon (original artwork) to PNGs using headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sizes = { 'build/icon.png': 512, 'public/icon.png': 192, 'build/icon-fg.png': 432 };
  for (const [file, size] of Object.entries(sizes)) {
    const fg = file.includes('fg');
    const data = await page.evaluate(({ size, fg }) => {
      const N = 32;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d');
      const px = (a, b, col) => { x.fillStyle = col; x.fillRect(a, b, 1, 1); };
      if (!fg) {
        const grd = x.createLinearGradient(0, 0, 0, N);
        grd.addColorStop(0, '#0b1430'); grd.addColorStop(1, '#1c2f62');
        x.fillStyle = grd; x.fillRect(0, 0, N, N);
        // stars
        [[3, 4], [27, 3], [6, 26], [28, 22], [12, 2], [22, 28], [2, 15]].forEach(([a, b]) => px(a, b, '#ffffffcc'));
      }
      // planet
      const cx = 15.5, cy = 17.5, r = 10.5;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
        if (d > r) continue;
        const n = Math.sin(i * 0.9) * Math.cos(j * 0.7) + Math.sin((i + j) * 0.45);
        let col = n > 0.35 ? (j < 10 || j > 25 ? '#eef3f7' : n > 1.1 ? '#7a7068' : '#5ea83a') : '#2a5ea8';
        if (d > r - 1.2) col = n > 0.35 ? '#3e7a2a' : '#1d457f';
        if (i + j < 26 && d < r - 2 && n <= 0.35) col = '#3c80c8';
        px(i, j, col);
      }
      // city lights on the night side
      [[19, 20], [21, 17], [18, 23], [22, 21]].forEach(([a, b]) => px(a, b, '#ffd860'));
      // ring
      x.fillStyle = '#ffcf4a';
      for (let i = 2; i < 30; i++) { const yy = Math.round(17.5 + (i - 15.5) * 0.28); if (Math.hypot(i + 0.5 - cx, yy + 0.5 - cy) > r - 0.5 || i < 8) x.fillRect(i, yy, 1, 1); }
      // rocket
      const rk = [[25, 4, '#e33'], [24, 5, '#eee'], [25, 5, '#eee'], [26, 5, '#eee'], [24, 6, '#eee'], [25, 6, '#6cf'], [26, 6, '#eee'], [24, 7, '#eee'], [25, 7, '#eee'], [26, 7, '#eee'], [23, 8, '#e33'], [24, 8, '#eee'], [25, 8, '#eee'], [26, 8, '#eee'], [27, 8, '#e33'], [25, 9, '#ffb02e'], [24, 9, '#ff6a1a'], [26, 9, '#ff6a1a'], [25, 10, '#ffe680']];
      rk.forEach(([a, b, col]) => px(a, b, col));
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const o = out.getContext('2d');
      o.imageSmoothingEnabled = false;
      const pad = fg ? size * 0.18 : 0;
      o.drawImage(c, pad, pad, size - pad * 2, size - pad * 2);
      return out.toDataURL('image/png').split(',')[1];
    }, { size, fg });
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), Buffer.from(data, 'base64'));
    console.log('wrote', file);
  }
  await browser.close();
})();
