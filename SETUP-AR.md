# EDEN CRM — التنصيب خطوة بخطوة (Windows)

## 1) فك الضغط
- كليك يمين على `eden-crm.zip` ← **Extract All** ← اكتب `D:\` بس ← **Extract**.
- افتح `D:\eden-crm`، المفروض تلاقي جواه `src` و`intake` على طول.
- دوس في شريط العنوان فوق، واكتب `cmd`، ودوس Enter.
  - لو فتحت cmd من Start، اكتب `cd /d D:\eden-crm`، ومتنساش `/d`.

## 2) مشروع Apps Script
1. افتح https://script.google.com بحساب `coo@edenalkhalij.com` ← **New project** ← سمّيه `EDEN CRM`.
2. من الترس ⚙️ **Project Settings**، انسخ الـ **Script ID**.

## 3) اربط الفولدر
```
copy .clasp.json.example .clasp.json
notepad .clasp.json
```
- امسح `PUT_MAIN_SCRIPT_ID_HERE` بس، والصق الـ ID مكانها، وسيب علامات التنصيص.
- **Ctrl+S** واقفل Notepad.
- اتأكد بالأمر `type .clasp.json`. لو لسه شايف PUT_MAIN... يبقى الحفظ ماتمّش.

## 4) ارفع الكود
```
npx clasp push -f
```
- لو سألك عن `appsscript.json` قول **y**.
- **Request contains an invalid argument** = الـ Script ID غلط أو مش متحط (ارجع لخطوة 3).
- مش عامل login ← `npx clasp login`.
- خطأ فيه Apps Script API ← شغّله من https://script.google.com/home/usersettings.

## 5) شغّل setup
1. في script.google.com اعمل Refresh، وافتح **Setup.gs**.
2. اختار الدالة **setup**، ودوس **Run**.
3. وافق على الصلاحيات: Advanced ← Go to EDEN CRM ← Allow. فيها Sheets والإيميل والكالندر والـ Triggers.
4. من **Execution log** احفظ عندك:
   - لينك الشيت
   - `SPREADSHEET_ID`
   - `INTAKE_SECRET`

## 6) انشر
```
npx clasp deploy --description "v1"
```
بعدها **Deploy ← Manage deployments**، وانسخ لينك الـ **Web app** (آخره `/exec`). ده لينك البرنامج.

## 7) جهّز البرنامج
1. **Settings ← Projects**: ضيف المشاريع.
2. **Inventory ← Import units**: الصق من Excel أعمدة `code, project, type, floor, area, price, currency`.
3. **Settings ← Team and permissions**: ضيف كل واحد بإيميل الشركة، واختار الدور، وعلّم **Receives leads** للسيلز.
4. **Settings ← WhatsApp templates**: عدّل الرسايل لو حابب.
5. ابعت لينك البرنامج للفريق. **متشاركش شيت الداتا مع حد.**

## 8) فورم الموقع (Intake)
1. اعمل مشروع Apps Script جديد اسمه `EDEN CRM Intake`، وانسخ الـ Script ID بتاعه.
2. اربطه وارفعه:
   ```
   cd intake
   copy .clasp.json.example .clasp.json
   notepad .clasp.json
   ```
   حط الـ ID، وبعدها افتح `notepad Code.gs`، وحط `SPREADSHEET_ID` و`INTAKE_SECRET`.
   ```
   npx clasp push -f
   npx clasp deploy --description "v1"
   ```
3. في المحرر شغّل `doGet` مرة عشان توافق على الصلاحيات، وانسخ لينك الـ Web app.
4. في `website-snippet.html` حط اللينك والـ Secret، وادّيه للي ماسك الموقع.

## 9) Meta Lead Ads
1. محتاج **Page Access Token** فيه صلاحية `leads_retrieval`. الأحسن من System User في Business Settings عشان مايخلصش.
2. هات الـ **Form ID** لكل فورم من Meta Business Suite ← Instant Forms.
3. في البرنامج: **Settings ← Meta Lead Ads**.
4. حط الـ Token، والفورمات بالشكل ده (كل فورم في سطر):
   ```
   1234567890123456:Eden Walk
   ```
5. دوس **Save**، وبعدها **Test connection**.

---

## التحديثات بعد كده
```
cd /d D:\eden-crm
npx clasp push -f
```
- شغّل `setup()` تاني لو التحديث فيه شيتات أو أعمدة جديدة.
- بعدها **Deploy ← Manage deployments ← ✏️ Edit ← Version: New version ← Deploy**، عشان اللينك يفضل زي ما هو.
