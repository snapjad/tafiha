# طفّيها · BRAND.md

دليل مختصر للمطوّرين والمصممين. الدليل الكامل: كتاب الهوية من Claude Design (`Tafiha Brand Book`، مش منشور بالموقع).

## الفكرة
الطاء بكلمة «طفّيها» مرسومة كرمز زر الإطفاء ⏻، وألفها سيجارة مايلة 22° بتنطفي جوّا دائرة الزر: فلتر أصفر، وجسم أبيض، وراس جمرة حمرا بنص الدائرة بالزبط.

## ملفات اللوغو (`assets/brand/`، والـ PNG بتنعمل بـ `node scripts/brand.mjs`)
**svg/**
- `tafiha-icon.svg`: أيقونة التطبيق 1024، خلفية حبر، مربّع كامل (iOS بيدوّره لحاله).
- `tafiha-icon-rounded.svg`: نفس الأيقونة بزوايا مدوّرة، للويب والعروض.
- `tafiha-android-foreground.svg` و`-background.svg` و`-monochrome.svg`: Android adaptive (108dp). الرمز جوّا الدائرة الآمنة 66dp.
- `favicon.svg`: نسخة لون واحد.
- `tafiha-logo-transparent-light.svg`: الكلمة العربية، شفاف، للخلفيات الغامقة (الأساسي).
- `tafiha-logo-transparent-dark.svg`: الكلمة العربية، شفاف، للخلفيات الفاتحة.
- `tafiha-logo-mono-black.svg` و`-white.svg`: لون واحد، للطباعة والحفر والتطريز.
- `tafiha-mark-transparent-*.svg`: الرمز لحاله.
- `tafiha-en-transparent-*.svg`: الكلمة الإنجليزية tafiha.

**png/**
- `tafiha-icon-1024/512/192/180.png`: للمتاجر، والـ PWA، وapple-touch-icon.
- `favicon-32.png` و`favicon-16.png`.
- `instagram-profile-320.png`.
- `tafiha-logo-light-2000.png` و`tafiha-logo-dark-2000.png`: شفاف.

- **الألوان الأساسية للوغو:** حلقة وجسم أبيض #FFFFFF، فلتر أصفر #E5A548، راس جمرة #E1261C، على حبر #1B1716.
- **على أبيض:** الحلقة والحروف حبر #1B1716، والفلتر والراس نفس الألوان.
- **على أحمر (ثانوي):** أبيض، والراس حبر.
- **المساحة الفاضية:** قد طول الفلتر من كل جهة.
- **أصغر حجم:** الكلمة 72px (18mm). الرمز 16px (5mm)، وتحت 24px بنستعمل لون واحد.
- **ممنوع:** المطّ، والتدوير، والظلال والتوهّج، والتدرّجات، وتبديل ألوان السيجارة، وإعادة كتابته بخط جاهز.

## البناء
- وحدة السماكة 1u = 24. الشدّة 13. النقاط مربّعات 22 بزاوية 4.
- حلقة الطاء دائرة نصف قطرها 46 (مركزها 306، −46)، وفتحتها 76° من فوق.
- حرف i بالإنجليزي سيجارة واقفة: فلتر أصفر 31 تحت، جسم 42، وجمرة حمرا 18 مكان النقطة، وبينهم فراغ 3 و12.
- السيجارة 24×107، مايلة −22° حول مركز الدائرة، والفلتر لجهة الكلمة. فراغ 3 بين الفلتر والجسم والراس.

## الألوان
| الاسم | HEX | RGB | CMYK | الدور |
|---|---|---|---|---|
| أحمر الجمرة | #E1261C | 225 38 28 | 0 83 88 12 | الأساسي · أزرار وتركيز |
| أحمر غامق | #A8150F | 168 21 15 | 0 88 91 34 | نص أحمر على فاتح · ضغط |
| أحمر ساخن | #FF6A2B | 255 106 43 | 0 58 83 0 | لحظة الاشتعال بالحركة |
| أصفر الفلتر | #E5A548 | 229 165 72 | 0 28 69 10 | ثانوي · إنجازات |
| أصفر غامق | #B8741F | 184 116 31 | 0 37 83 28 | نص صغير على الأصفر الفاتح |
| أصفر فاتح | #FBEBD0 | 251 235 208 | 0 6 17 2 | بطاقات دافية |
| أبيض | #FFFFFF | 255 255 255 | 0 0 0 0 | البطاقات |
| رمادي الخلفية | #F3F3F4 | 243 243 244 | 0 0 0 4 | خلفية التطبيق |
| حبر | #1B1716 | 27 23 22 | 0 15 19 89 | النصوص · خلفية اللوغو |
| رمادي الدخان | #7F7976 | 127 121 118 | 0 5 7 50 | أيقونات وخطوط فقط |
| دخان للنصوص | #726C69 | 114 108 105 | 0 5 8 55 | نص ثانوي (AA) |
| رمادي الرماد | #B9B4B0 | 185 180 176 | 0 3 5 27 | حالة مطفية · فواصل |

النسب: أبيض 50% · رمادي 15% · حبر 18% · أحمر 10% · أصفر 5%.
التباين: أبيض على أحمر 4.67:1 (AA). الأصفر والأحمر على أبيض للعناوين الكبيرة والأشكال بس.

## الخطوط
- **العناوين:** Alexandria، بوزن 700 و800.
- **النصوص:** Readex Pro، بوزن 300 لـ 500. ارتفاع السطر 1.6 لـ 1.8.
- **الأرقام:** Big Shoulders Display 800.

| الدور | الحجم/السطر |
|---|---|
| عدّاد | 96/88 |
| عنوان كبير | 32/44 |
| عنوان | 22/32 |
| نص | 16/28 |
| زر | 17/24 |
| ملاحظة | 13/20 |

## الحركة
- **أنيميشن اللوغو (1.8 ثانية):** الراس بيكون رمادي، بعدين بيضوي سحبتين (#FF6A2B ثم #E1261C)، بعدين بيبرد لـ #A8150F وبيرجع رمادي، وبيطلع خيط دخان رفيع (trim path).
- **السرعات:** 120ms للضغطات، 240ms للدخول، 420ms للإنجازات، والتنفّس 4s شهيق و6s زفير.
- **المنحنى:** cubic-bezier(.2,.8,.2,1) بدون ارتداد. العناصر بتطلع 12px لفوق مع ظهور، وورا بعض كل 40ms.

## الأيقونات الثلاثية الأبعاد
ضوء رئيسي من فوق على اليمين بزاوية 45° (4500K) وضوء تعبئة من الشمال بنص القوة. مادة مطفية متل الطين (roughness 0.55). كاميرا 50mm بزاوية 30° من فوق ودوران 25°. ألوان الباليت بس (أحمر، أصفر، أبيض، حبر)، لونين بالكتير. ظل تلامس ناعم 20%. اللوغو ما بيصير ثلاثي الأبعاد أبداً.

## الصوت
صاحبك اللي ترك قبلك: بيحكي أردني، كلامه قليل، ما بيخوّف ولا بيعيّب.
- **منستعمل:** طفّيها، صارلك، عندي رغبة، الرغبة موجة، بنكمّل، سوا، مسموحلك اليوم.
- **منتجنّب:** مدمن، فشلت، انتكاسة، ممنوع، يجب عليك.

---

## In the code (for developers)

| What | Where |
| --- | --- |
| Color tokens | `css/app.css` `:root`: `--ember`, `--ember-deep`, `--ember-hot`, `--filter`, `--filter-deep`, `--filter-soft`, `--ink`, `--paper`, `--bg`, `--smoke` (#726C69, text), `--smoke-line` (#7F7976, icons and lines), `--ash`, `--line`. Legal pages: `css/legal.css`. |
| Fonts | `--f-display` (Alexandria, headings), `--f-body` (Readex Pro), `--f-num` (Big Shoulders Display). Self-hosted in `assets/fonts/` (`css/fonts.css`). |
| Motion | `--out` / `--spring` = `cubic-bezier(.2,.8,.2,1)`; `--t-fast` 120ms, `--t` 240ms, `--t-slow` 420ms; `@keyframes rise` = 12px up + fade; cards stagger 40ms. |
| Logo animation | Boot splash in `index.html` (`.boot-mark`, `.boot-tip`, `.boot-smoke`, CSS in `app.css`), the tilted-cigarette mark (rotate −22° around 306,−46). It loops every 2.4s until the app is ready. Welcome screen 1 runs the design's 4.4s version (`.intro-ember`, `.intro-smoke`). Both respect reduced motion. |
| Welcome screens | `js/onboarding.js` + `css/onboarding.css`, from the Claude Design «Tafiha Onboarding» (6 screens). Shown once on first launch (`localStorage['tafiha.intro']`), before the interview. «اسأل دكتور» (screen 5 and the line on screen 6) only when `consult_enabled` is on in the admin area. |
| Android icons | `assets/brand/tafiha-android-{foreground,background,monochrome}.svg` (adaptive, 108dp, mark in the 66dp safe circle), for the Capacitor build. |
| Wordmark placements | Header (`index.html`, 80px), welcome screen 1 (`js/onboarding.js`, light, 132px), interview start (lockup with the rounded icon, `js/assessment.js`), sign-in (`js/account.js`, 84px), legal pages (lockup), admin area, story image (`js/share.js`, light, 300px), story preview (the mark). |
| App icons | `node scripts/brand.mjs` renders every size from `assets/brand/tafiha-icon.svg`: `icon-192/512`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`, plus `assets/store/` (Play 512, iOS 1024, Instagram profile 320). It also bumps the service worker cache. |
| Manifest | `theme_color` #F3F3F4 (red stays rare), `background_color` #1B1716 (ink splash, like the icon). |
| 3D icons | `blender/make_icons.py` (brand settings above). Run: `blender -b --factory-startup -P blender/make_icons.py -- assets/icons final`. |
| Story image | `js/share.js`, following the brand's story template (ink, "اليوم", the big number, one line, the wordmark as signature). |
