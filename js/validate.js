// طفّيها — checking what people type when they make an account: phone numbers
// from any country (stored as +<code><number>), emails, passwords, and turning
// the server's errors into plain Arabic.

// len = digits after the country code, without the leading 0
export const COUNTRIES = [
  { iso: 'JO', name: 'الأردن', dial: '962', len: [8, 9], ex: '79 123 4567', tz: ['Asia/Amman'] },
  { iso: 'SA', name: 'السعودية', dial: '966', len: [9, 9], ex: '50 123 4567', tz: ['Asia/Riyadh'] },
  { iso: 'AE', name: 'الإمارات', dial: '971', len: [8, 9], ex: '50 123 4567', tz: ['Asia/Dubai'] },
  { iso: 'KW', name: 'الكويت', dial: '965', len: [8, 8], ex: '5012 3456', tz: ['Asia/Kuwait'] },
  { iso: 'QA', name: 'قطر', dial: '974', len: [8, 8], ex: '3312 3456', tz: ['Asia/Qatar'] },
  { iso: 'BH', name: 'البحرين', dial: '973', len: [8, 8], ex: '3600 1234', tz: ['Asia/Bahrain'] },
  { iso: 'OM', name: 'عُمان', dial: '968', len: [8, 8], ex: '9212 3456', tz: ['Asia/Muscat'] },
  { iso: 'IQ', name: 'العراق', dial: '964', len: [8, 10], ex: '790 123 4567', tz: ['Asia/Baghdad'] },
  { iso: 'SY', name: 'سوريا', dial: '963', len: [8, 9], ex: '944 567 890', tz: ['Asia/Damascus'] },
  { iso: 'LB', name: 'لبنان', dial: '961', len: [7, 8], ex: '71 123 456', tz: ['Asia/Beirut'] },
  { iso: 'PS', name: 'فلسطين', dial: '970', len: [8, 9], ex: '599 123 456', tz: ['Asia/Gaza', 'Asia/Hebron'] },
  { iso: 'EG', name: 'مصر', dial: '20', len: [8, 10], ex: '100 123 4567', tz: ['Africa/Cairo'] },
  { iso: 'SD', name: 'السودان', dial: '249', len: [9, 9], ex: '91 123 1234', tz: ['Africa/Khartoum'] },
  { iso: 'LY', name: 'ليبيا', dial: '218', len: [8, 9], ex: '91 234 5678', tz: ['Africa/Tripoli'] },
  { iso: 'TN', name: 'تونس', dial: '216', len: [8, 8], ex: '20 123 456', tz: ['Africa/Tunis'] },
  { iso: 'DZ', name: 'الجزائر', dial: '213', len: [8, 9], ex: '551 23 45 67', tz: ['Africa/Algiers'] },
  { iso: 'MA', name: 'المغرب', dial: '212', len: [9, 9], ex: '650 123 456', tz: ['Africa/Casablanca', 'Africa/El_Aaiun'] },
  { iso: 'MR', name: 'موريتانيا', dial: '222', len: [8, 8], ex: '22 12 34 56', tz: ['Africa/Nouakchott'] },
  { iso: 'YE', name: 'اليمن', dial: '967', len: [7, 9], ex: '712 345 678', tz: ['Asia/Aden'] },
  { iso: 'SO', name: 'الصومال', dial: '252', len: [7, 9], ex: '61 234 5678', tz: ['Africa/Mogadishu'] },
  { iso: 'DJ', name: 'جيبوتي', dial: '253', len: [8, 8], ex: '77 83 10 01', tz: ['Africa/Djibouti'] },
  { iso: 'KM', name: 'جزر القمر', dial: '269', len: [7, 7], ex: '321 23 45', tz: ['Indian/Comoro'] },
  { iso: 'TR', name: 'تركيا', dial: '90', len: [10, 10], ex: '501 234 5678', tz: ['Europe/Istanbul'] },
  { iso: 'GB', name: 'بريطانيا', dial: '44', len: [9, 10], ex: '7400 123456', tz: ['Europe/London'] },
  { iso: 'DE', name: 'ألمانيا', dial: '49', len: [7, 11], ex: '1512 3456789', tz: ['Europe/Berlin'] },
  { iso: 'FR', name: 'فرنسا', dial: '33', len: [9, 9], ex: '6 12 34 56 78', tz: ['Europe/Paris'] },
  { iso: 'NL', name: 'هولندا', dial: '31', len: [9, 9], ex: '6 12345678', tz: ['Europe/Amsterdam'] },
  { iso: 'BE', name: 'بلجيكا', dial: '32', len: [8, 9], ex: '470 12 34 56', tz: ['Europe/Brussels'] },
  { iso: 'SE', name: 'السويد', dial: '46', len: [7, 9], ex: '70 123 45 67', tz: ['Europe/Stockholm'] },
  { iso: 'DK', name: 'الدنمارك', dial: '45', len: [8, 8], ex: '20 12 34 56', tz: ['Europe/Copenhagen'] },
  { iso: 'NO', name: 'النرويج', dial: '47', len: [8, 8], ex: '406 12 345', tz: ['Europe/Oslo'] },
  { iso: 'AT', name: 'النمسا', dial: '43', len: [7, 13], ex: '664 123456', tz: ['Europe/Vienna'] },
  { iso: 'CH', name: 'سويسرا', dial: '41', len: [9, 9], ex: '78 123 45 67', tz: ['Europe/Zurich'] },
  { iso: 'IT', name: 'إيطاليا', dial: '39', len: [6, 11], ex: '312 345 6789', tz: ['Europe/Rome'] },
  { iso: 'ES', name: 'إسبانيا', dial: '34', len: [9, 9], ex: '612 34 56 78', tz: ['Europe/Madrid'] },
  { iso: 'US', name: 'أمريكا', dial: '1', len: [10, 10], ex: '201 555 0123',
    tz: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Detroit', 'America/Anchorage'] },
  { iso: 'CA', name: 'كندا', dial: '1', len: [10, 10], ex: '506 234 5678',
    tz: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax'] },
  { iso: 'AU', name: 'أستراليا', dial: '61', len: [9, 9], ex: '412 345 678',
    tz: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide'] },
  { iso: 'MY', name: 'ماليزيا', dial: '60', len: [9, 10], ex: '12 345 6789', tz: ['Asia/Kuala_Lumpur'] },
  { iso: 'XX', name: 'دولة تانية', dial: '', len: [8, 15], ex: '+…', tz: [] },
];

const BY_ISO = Object.fromEntries(COUNTRIES.map((c) => [c.iso, c]));
export const country = (iso) => BY_ISO[iso] || BY_ISO.JO;

export const flag = (iso) => (iso === 'XX' ? '🌐' : String.fromCodePoint(...[...iso].map((ch) => 0x1f1a5 + ch.charCodeAt(0))));

// best guess from the device's time zone; Jordan when we can't tell
export function guessCountry(tz) {
  let zone = tz;
  if (zone === undefined) {
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { zone = ''; }
  }
  return COUNTRIES.find((c) => c.tz.includes(zone))?.iso || 'JO';
}

// ٠١٢ and ۰۱۲ → 012
export const latinDigits = (s) => String(s ?? '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const fits = (c, n) => /^\d+$/.test(n) && n.length >= c.len[0] && n.length <= c.len[1];

// → { e164: '+962791234567', iso: 'JO' } or null when it can't be a real number.
// Accepts "0791234567", "79 123 4567", "+962 79…", "00962…"; a number typed with
// its own country code wins over the picked country.
export function parsePhone(iso, raw) {
  let d = latinDigits(raw).replace(/[^\d+]/g, '');
  const intl = d.startsWith('+') || d.startsWith('00');
  d = d.replace(/^\+/, '').replace(/^00/, '');
  if (!d) return null;
  if (intl || iso === 'XX') {
    const hits = COUNTRIES.filter((c) => c.dial && d.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length);
    const picked = hits.find((c) => c.iso === iso) || hits[0];
    if (picked) {
      const n = d.slice(picked.dial.length);
      return fits(picked, n) ? { e164: `+${picked.dial}${n}`, iso: picked.iso } : null;
    }
    return iso === 'XX' && d.length >= 8 && d.length <= 15 ? { e164: `+${d}`, iso: 'XX' } : null;
  }
  const c = country(iso);
  if (d.startsWith(c.dial) && d.length - c.dial.length >= c.len[0] && !fits(c, d.replace(/^0+/, ''))) d = d.slice(c.dial.length);
  if (c.iso !== 'IT') d = d.replace(/^0+/, '');
  return fits(c, d) ? { e164: `+${c.dial}${d}`, iso: c.iso } : null;
}

// the number without its country code, for showing it back in the form
export function nationalPart(e164, iso) {
  const c = country(iso);
  if (!e164) return '';
  if (c.iso === 'XX') return e164;
  return e164.startsWith(`+${c.dial}`) ? e164.slice(c.dial.length + 1) : e164;
}

export const isEmail = (s) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(String(s || '').trim());

// Matches the server (Supabase Auth: at least 8 characters, a Latin letter and a digit).
// The free plan has no breach check, so the most common passwords that would still pass
// the rule are refused here too.
export const PASSWORD_MIN = 8;
export const PASSWORD_HINT = `${PASSWORD_MIN} أحرف أو أكثر، فيها حرف إنجليزي ورقم`;
const COMMON = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'pass1234', 'abc12345', 'abcd1234', 'a1b2c3d4',
  'qwerty12', 'qwerty123', 'qwerty1234', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'asdf1234', 'iloveyou1',
  'welcome1', 'admin123', 'letmein1', 'test1234', '12345678a', '123456789a', 'a12345678', 'aa123456',
  'jordan123', 'amman123', 'tafiha123', 'tafiha2026',
]);
export function passwordProblem(s) {
  const p = String(s || '');
  if (p.length < PASSWORD_MIN) return `كلمة السر لازم تكون ${PASSWORD_MIN} أحرف أو أكثر.`;
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'لازم يكون فيها حرف إنجليزي ورقم (0-9) على الأقل.';
  if (COMMON.has(p.toLowerCase())) return 'كلمة السر هاي مشهورة كثير وسهل حدا يخمّنها. اختار وحدة تانية.';
  return '';
}
export const passwordOk = (s) => !passwordProblem(s);

// the server's error → a sentence people understand
export function authError(e) {
  if (!e) return '';
  const code = e.code || '';
  const msg = String(e.message || '').toLowerCase();
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'ما في نت أو السيرفر مش راد. تأكد من النت وجرّب كمان مرة.';
  }
  if (msg.includes('signups_closed')) return 'إنشاء الحسابات موقّف هلأ. جرّب بعدين.';
  if (code === 'captcha_pending') return 'لحظة، عم نتأكد إنك مش روبوت. إذا طلعلك مربع تحت، اكبس عليه وجرّب كمان مرة.';
  if (code === 'captcha_failed' || msg.includes('captcha')) return 'ما قدرنا نتأكد إنك مش روبوت. جرّب كمان مرة.';
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) {
    return 'هالإيميل إله حساب. اكبس «عندي حساب» وسجّل دخول.';
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'الإيميل أو كلمة السر غلط.';
  if (code === 'weak_password' || msg.includes('password should be')) return `كلمة السر ضعيفة: لازم تكون ${PASSWORD_HINT}، وما تكون سهلة.`;
  if (code === 'same_password') return 'هاي نفس كلمة السر القديمة. اختار وحدة جديدة.';
  if (code === 'email_address_invalid' || msg.includes('invalid format') || msg.includes('email address') && msg.includes('invalid')) return 'الإيميل مش مزبوط.';
  if (code === 'email_not_confirmed') return 'لازم تأكد إيميلك أول.';
  if (code === 'otp_expired' || msg.includes('token has expired') || msg.includes('invalid otp')) return 'الرمز غلط أو خلص وقته. اطلب رمز جديد.';
  if (code.startsWith('over_') || e.status === 429 || msg.includes('rate limit')) return 'محاولات كثير ورا بعض. استنّى شوي وجرّب كمان مرة.';
  if (code === 'signup_disabled') return 'إنشاء الحسابات موقّف هلأ. جرّب بعدين.';
  if (code === 'user_banned') return 'هالحساب موقوف.';
  return 'صار خطأ. جرّب كمان مرة.';
}
