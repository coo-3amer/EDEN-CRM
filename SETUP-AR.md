# EDEN CRM — التشغيل على crm.edenalkhalij.com

## الفكرة
- الكود كله على GitHub في الريبو ده.
- أي تعديل يتعمل في الريبو، GitHub Actions بيعمل لوحده:
  1. يشغّل الاختبارات.
  2. يرفع الكود على Apps Script ويحدّث الـ Web App.
  3. ينشر الموقع على **crm.edenalkhalij.com**.
- الدخول بإيميل الشغل: الشخص يكتب إيميله، فيوصله كود من 6 أرقام صالح 10 دقايق، ويفضل داخل 12 ساعة.
- مينفعش يدخل غير اللي الأدمن ضافه في **Settings → Team**.
- زرار Sign in with Google اختياري، وتقدر تضيفه بعدين (خطوة 3).
- مش محتاج تنزّل ملفات ولا تشغّل `clasp` تاني.

---

## الإعداد (مرة واحدة بس)

### 1) سر clasp (عشان GitHub يقدر يرفع على Apps Script)
على جهازك افتح cmd واكتب:
```
notepad %USERPROFILE%\.clasprc.json
```
هيفتح ملف فيه نص طويل. اعمل **Ctrl+A** وبعدين **Ctrl+C**.

بعدها:
1. افتح الريبو على GitHub ← **Settings** ← **Secrets and variables** ← **Actions**.
2. تاب **Secrets** ← **New repository secret**.
3. **Name:** `CLASPRC_JSON`، و **Secret:** الصق النص ← **Add secret**.

> الملف ده مفتاح حسابك. متبعتهوش لحد، ومتحطهوش غير في Secrets.

### 2) Script ID
1. في نفس الصفحة، تاب **Variables** ← **New repository variable**.
2. **Name:** `SCRIPT_ID`، و **Value:** الـ Script ID بتاع مشروع EDEN CRM. هتلاقيه في script.google.com ← ⚙️ Project Settings.

### 3) (اختياري) زرار "Sign in with Google"
الدخول بكود الإيميل شغال من غير الخطوة دي. اعملها بس لو عايز زرار جوجل كمان.

1. افتح https://console.cloud.google.com بحساب `coo@edenalkhalij.com`.
2. من فوق اختار **New Project**، وسمّيه `EDEN CRM`، ودوس **Create**.
3. من القايمة روح **APIs & Services** ← **OAuth consent screen** (أو **Google Auth Platform**) ← **Get started**:
   - App name: `EDEN CRM`.
   - Support email: إيميلك.
   - **Audience: Internal**. ده معناه إن حسابات الشركة بس هي اللي تقدر تدخل.
   - كمّل ودوس **Create**.
4. روح **Clients** (أو **Credentials**) ← **Create client**:
   - Application type: **Web application**.
   - Name: `EDEN CRM website`.
   - **Authorized JavaScript origins** ← **Add URI** ← `https://crm.edenalkhalij.com`.
   - دوس **Create**، وانسخ الـ **Client ID** (آخره `.apps.googleusercontent.com`).
5. في GitHub ← **Variables** ← **New repository variable**:
   - **Name:** `GOOGLE_CLIENT_ID`
   - **Value:** الـ Client ID

### 4) GitHub Pages والدومين
1. الريبو ← **Settings** ← **Pages** ← **Source:** اختار **GitHub Actions**.
2. **Custom domain:** اكتب `crm.edenalkhalij.com` ← **Save**.
3. في الـ DNS بتاع edenalkhalij.com، زي ما عملت مع dashboard، ضيف record:
   - Type: **CNAME**
   - Name: `crm`
   - Value: `coo-3amer.github.io`
4. لما يظهر ✓، علّم **Enforce HTTPS**.

### 5) أول نشر
1. الريبو ← **Actions** ← **Deploy EDEN CRM** ← **Run workflow** ← **Run workflow**.
2. استنى لحد ما الـ 3 خطوات يبقوا ✓ (test، apps-script، site).

### 6) وافق على الصلاحيات الجديدة (مرة واحدة)
1. افتح المشروع في script.google.com، واعمل Refresh.
2. افتح **Setup.gs**، واختار **setup**، ودوس **Run**.
3. وافق على الصلاحيات. فيها الكالندر، وهي اللي كانت ناقصة المرة اللي فاتت.

البرنامج بيشتغل بحسابك إنت، فلازم الموافقة دي تتعمل قبل ما حد يدخل.

### 7) افتح https://crm.edenalkhalij.com 🎉

---

## بعد كده
- أي تعديل بطلبه، بيترفع على GitHub، وخلال دقيقتين بيبقى على الموقع لوحده.
- لو التحديث فيه صلاحيات جديدة، هقولك تعيد خطوة 6.
- كل نشر تقدر تتابعه من تاب **Actions** في الريبو.

## لو حاجة مش شغالة
| المشكلة | الحل |
|---|---|
| خطوة apps-script بتقول Apps Script API is off | شغّله من https://script.google.com/home/usersettings، وبعدها Re-run |
| بتقول Google refused the clasp login | اعمل `npx clasp login` على جهازك، وحط الملف الجديد في `CLASPRC_JSON` |
| الموقع بيقول "not connected yet" | ناقص `CLASPRC_JSON` أو `SCRIPT_ID`، أو أول نشر ماخلصش. اعمل Run workflow تاني |
| الكود مش بيوصل | دوّر في Spam، واتأكد إن الإيميل متضاف في Team ومعلّم Active |
| زرار جوجل بيقول origin not allowed | اتأكد إن `https://crm.edenalkhalij.com` مكتوب بالظبط في Authorized JavaScript origins |
| "has not been added to EDEN CRM" | الأدمن يضيف الإيميل من **Settings → Team** |
| الموقع بيقول "did not answer" بعد النشر | اعمل خطوة 6 (setup والموافقة) |
| عايز تخرّج الكل من البرنامج | شغّل `signOutEveryone` من محرر Apps Script |
