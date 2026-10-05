// طفّيها — makes the Google Play upload key, once.
//
//   node scripts/release-key.mjs
//
// Google Play only accepts app updates signed with the same upload key, so this runs one time
// on the owner's computer and the key never enters the repository (it's public):
//   1. an RSA key + 27-year certificate in a PKCS#12 file (alias "upload"), random password;
//   2. a copy in a folder on the Desktop («مفتاح طفّيها») with a note, to back up somewhere safe;
//   3. one text value for the ANDROID_UPLOAD_KEY GitHub secret (base64 of {password, keystore}),
//      saved there and copied to the clipboard; .github/workflows/android.yml signs with it.
// Run it again later and it only copies that value again; it never replaces an existing key.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = join(homedir(), 'Desktop', 'مفتاح طفّيها');
const keyFile = join(folder, 'tafiha-upload-key.p12');
const secretFile = join(folder, 'للصق في جيت هب.txt');

const OPENSSL = [
  process.env.OPENSSL,
  'C:/Program Files/Git/mingw64/bin/openssl.exe',
  'C:/Program Files/Git/usr/bin/openssl.exe',
  '/opt/homebrew/bin/openssl',
  '/usr/bin/openssl',
].find((p) => p && existsSync(p)) || 'openssl';
const openssl = (args, cwd) => execFileSync(OPENSSL, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function toClipboard(text) {
  const cmd = process.platform === 'win32' ? ['clip'] : process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard'];
  return spawnSync(cmd[0], cmd.slice(1), { input: text }).status === 0;
}

if (existsSync(keyFile)) {
  const copied = existsSync(secretFile) && toClipboard(readFileSync(secretFile, 'utf8').trim());
  console.log('في مفتاح من قبل بمجلد «مفتاح طفّيها» على سطح المكتب، وما غيّرته.');
  console.log(copied ? 'نسخت قيمة جيت هب كمان مرة.' : 'ما قدرت أنسخ قيمة جيت هب.');
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'tafiha-key-'));
try {
  const password = randomBytes(24).toString('base64url');
  writeFileSync(join(work, 'pass'), password);
  openssl(['req', '-x509', '-newkey', 'rsa:4096', '-sha256', '-days', '10000', '-nodes',
    '-keyout', 'key.pem', '-out', 'cert.pem', '-subj', '/CN=Tafiha/O=Tafiha/C=JO'], work);
  openssl(['pkcs12', '-export', '-inkey', 'key.pem', '-in', 'cert.pem', '-name', 'upload',
    '-out', 'upload.p12', '-passout', 'file:pass'], work);
  const finger = (alg) => openssl(['x509', '-in', 'cert.pem', '-noout', '-fingerprint', `-${alg}`], work).split('=')[1].trim();
  const sha256 = finger('sha256'), sha1 = finger('sha1');
  const keystore = readFileSync(join(work, 'upload.p12'));
  const secret = Buffer.from(JSON.stringify({ password, keystore: keystore.toString('base64') })).toString('base64');

  mkdirSync(folder, { recursive: true });
  writeFileSync(keyFile, keystore);
  writeFileSync(secretFile, secret + '\n');
  writeFileSync(join(folder, 'اقرأني.txt'), [
    'مفتاح رفع تطبيق طفّيها على جوجل بلاي',
    `انعمل بتاريخ ${new Date().toISOString().slice(0, 10)}`,
    '',
    'هاد المفتاح بيثبت لجوجل إنك إنت صاحب التطبيق. كل تحديث بتنرفعه لازم يكون موقّع فيه.',
    '',
    'احتفظ بنسخة من هالمجلد بمكان آمن (فلاشة، أو جوجل درايف الشخصي تبعك).',
    'لا تبعته لحدا، ولا تحطّه بجيت هب كملف، ولا ترفعه على أي موقع.',
    'إذا ضاع، جوجل بتقدر تغيّره بطلب للدعم، بس بياخد أيام.',
    '',
    'الملفات:',
    '  tafiha-upload-key.p12   المفتاح نفسه',
    '  للصق في جيت هب.txt      القيمة اللي بتنلصق بأسرار جيت هب باسم ANDROID_UPLOAD_KEY',
    '',
    'تفاصيل تقنية:',
    `  الاسم المستعار (alias): upload`,
    `  كلمة السر: ${password}`,
    `  SHA-256: ${sha256}`,
    `  SHA-1:   ${sha1}`,
    '',
  ].join('\r\n'), 'utf8');

  const copied = toClipboard(secret);
  console.log('تم: انعمل المفتاح، وانحفظ بمجلد «مفتاح طفّيها» على سطح المكتب.');
  console.log(copied ? 'ونسخت قيمة جيت هب. ارجع للمحادثة.' : 'ما قدرت أنسخ القيمة، بس هي محفوظة بالمجلد.');
  console.log(`SHA-256 ${sha256}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
