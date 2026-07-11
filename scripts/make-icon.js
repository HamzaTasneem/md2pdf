const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DRAW = (size) => `(() => {
  const s = ${size};
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const x = c.getContext('2d');
  const r = s * 0.18;
  x.beginPath();
  x.moveTo(r, 0); x.arcTo(s, 0, s, s, r); x.arcTo(s, s, 0, s, r);
  x.arcTo(0, s, 0, 0, r); x.arcTo(0, 0, s, 0, r); x.closePath();
  x.fillStyle = '#141414'; x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#d4a017';
  x.font = '800 ' + s * 0.36 + 'px "Segoe UI", Arial, sans-serif';
  x.fillText('MD', s / 2, s * 0.33);
  x.fillRect(s * 0.2, s * 0.51, s * 0.6, s * 0.025);
  x.fillStyle = '#ffffff';
  x.font = '800 ' + s * 0.3 + 'px "Segoe UI", Arial, sans-serif';
  x.fillText('PDF', s / 2, s * 0.73);
  return c.toDataURL('image/png');
})()`;

app.whenReady().then(async () => {
  try {
    const w = new BrowserWindow({ show: false, width: 600, height: 600 });
    await w.loadURL('about:blank');
    const buildDir = path.join(__dirname, '..', 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    for (const size of [512, 256]) {
      const dataUrl = await w.webContents.executeJavaScript(DRAW(size));
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(buildDir, size === 512 ? 'icon.png' : 'icon-256.png'), buf);
    }
    const mod = require('png-to-ico');
    const pngToIco = mod.default || mod;
    const ico = await pngToIco(path.join(buildDir, 'icon-256.png'));
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
    console.log('ICON OK');
    app.exit(0);
  } catch (err) {
    console.error('ICON FAIL: ' + err.message);
    app.exit(1);
  }
});
