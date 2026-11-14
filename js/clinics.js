// طفّيها — the quit-smoking clinics the Jordanian Ministry of Health has approved, by governorate.
// Source: the Ministry's list «المراكز الصحية المعتمدة لتقديم خدمات الإقلاع عن التدخين».
// Each place opens in the phone's maps app as a search; nothing about the person is sent.

export const SOURCE = 'وزارة الصحة الأردنية: المراكز الصحية المعتمدة لتقديم خدمات الإقلاع عن التدخين';

export const CLINICS = [
  { area: 'العاصمة', places: ['مركز صحي عمان الشامل', 'مركز صحي ماركا الشامل', 'مركز صحي مرج الحمام الشامل', 'مركز صحي المقابلين الشامل', 'مركز صحي الجبيهة الشامل', 'مركز صحي النصر الشامل', 'مستشفى البشير', 'مركز سميح دروزة للأورام'] },
  { area: 'وزارة الصحة', places: ['عيادة الوزارة'] },
  { area: 'البلقاء', places: ['مركز صحي السلط الأولي', 'مركز صحي زي الشامل', 'مركز صحي عين الباشا'] },
  { area: 'الزرقاء', places: ['مركز صحي وادي الحجر', 'مركز صحي خادم الحرمين', 'مركز صحي الرشيد'] },
  { area: 'مأدبا', places: ['مديرية صحة محافظة مأدبا'] },
  { area: 'إربد', places: ['مركز صحي الصريح', 'مركز صحي ضاحية الحسين', 'مركز صحي قميم'] },
  { area: 'لواء الرمثا', places: ['مركز صحي سهل حوران'] },
  { area: 'جرش', places: ['مركز صحي جرش الشامل', 'مركز صحي الرازي الشامل'] },
  { area: 'عجلون', places: ['مركز صحي عجلون الشامل'] },
  { area: 'المفرق', places: ['مركز صحي المفرق الشامل', 'مركز صحي البادية الشمالية'] },
  { area: 'الكرك', places: ['مركز صحي المرج الأولي', 'مركز صحي طلال شمال الكرك', 'مركز صحي المزار'] },
  { area: 'الطفيلة', places: ['مركز صحي الطفيلة الشامل'] },
  { area: 'معان', places: ['مركز صحي معان'] },
  { area: 'لواء البتراء', places: ['مركز صحي البتراء'] },
  { area: 'العقبة', places: ['مركز صحي الأميرة بسمة'] },
];

export const clinicCount = () => CLINICS.reduce((n, g) => n + g.places.length, 0);

// a maps search for the place, in its governorate
export function mapLink(place, area) {
  const where = area === 'وزارة الصحة' ? 'وزارة الصحة عمان' : area.replace(/^لواء /, '');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place} ${where} الأردن`)}`;
}
