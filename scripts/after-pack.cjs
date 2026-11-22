// Sets the Windows .exe icon and version info without needing Wine (pure-JS resource editing).
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default || ResEdit;
  const productName = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const icoPath = path.join(context.packager.info.projectDir, 'release', '.icon-ico', 'icon.ico');
  const exe = R.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exe);
  if (fs.existsSync(icoPath)) {
    const ico = R.Data.IconFile.from(fs.readFileSync(icoPath));
    const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
    const id = groups.length ? groups[0].id : 1;
    const lang = groups.length ? groups[0].lang : 1033;
    R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  }
  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const version = context.packager.appInfo.version;
    const [a, b, c] = version.split('.').map(Number);
    vi.setFileVersion(a, b, c, 0, 1033);
    vi.setProductVersion(a, b, c, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: 'WorldSim Ages', FileDescription: 'WorldSim Ages', CompanyName: 'WorldSim', OriginalFilename: `${productName}.exe`, InternalName: 'WorldSim Ages', LegalCopyright: 'MIT License',
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • patched exe icon/version (resedit)', exePath);
};
