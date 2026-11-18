#!/usr/bin/env python3
"""DO NOT RUN (Oct 28, 2026, v21): this generator is out of date. Since ainshop-v16 the pages in site/pages/ are edited by hand
(owner name hidden, mailing address, v21 privacy wording, no inline scripts: page code lives in /privacy-page.js, /terms-page.js,
/contact-page.js and /legal-common.js). Running it would bring back old wording and inline scripts that the CSP now refuses.
Old description: Builds site/pages/privacy.html, terms.html and contact.html (English + Hebrew).
Change the owner details ONLY here (OWNER block), then run:  python3 legal/build_legal.py
"""
import html, os
# ---------------- OWNER: the one place to change who publishes AIN Shop ----------------
OWNER = {
    "business": "",                       # e.g. "AIN Apps LLC" once a business exists; empty = individual developer
    "name": ""  # hidden at Nati's request Oct 27 9:12 PM; generator not updated for empty name — pages hand-edited,
    "name_he": "",
    "place": "Oak Park, Michigan, USA",
    "mail_address": "21700 Greenfield Rd, Ste 121 Unit #2118, Oak Park, MI 48237, USA",   # public mailing address (virtual mailbox, Oct 27 2026); NEVER the home address. NOTE: this generator is behind the live pages; pages were edited by hand for ainshop-v16
    "place_he": "אוק פארק, מישיגן, ארה\"ב",
    "email": "ainshop.corrections@mail.tab.bot",
    "updated": "October 26, 2026",
    "updated_he": "26 באוקטובר 2026",
    "price": "$4.99",
}
RETAIN = "12 months"; RETAIN_HE = "12 חודשים"     # must match RETAIN_DAYS in site/_worker.js
# -----------------------------------------------------------------------------------------
O = OWNER
WHO_EN = (f"{O['business']}, run by {O['name']}" if O['business'] else f"{O['name']}, an individual developer") + f" in {O['place']}"
WHO_HE = (f"{O['business']}, בניהול {O['name_he']} ({O['name']})" if O['business'] else f"{O['name_he']} ({O['name']}), מפתח עצמאי") + f" ב{O['place_he']}"
MAIL = f'<a href="mailto:{O["email"]}">{O["email"]}</a>'
DEL_MAIL = f'<a href="mailto:{O["email"]}?subject=AIN%20Shop%20-%20delete%20my%20data">{O["email"]}</a>'
HELP_MAIL = f'mailto:{O["email"]}?subject=AIN%20Shop%20help'

PRIVACY_EN = f"""
<h1>Privacy Policy</h1>
<p class="upd">Last updated: {O['updated']}</p>
<p>AIN Shop is a voice shopping assistant made by {WHO_EN} (“we”). This page explains, in plain words, what AIN Shop does with your information.</p>
<h2>The short version</h2>
<ul>
<li>No account. We do not ask for your name, email or phone number.</li>
<li>We do not record or keep your voice.</li>
<li>No ads and no analytics or tracking tools.</li>
<li>We never sell your information.</li>
</ul>
<h2>Your voice</h2>
<p>When you tap the talk button, your microphone sound is sent live to an AI provider (today: OpenAI). It turns your speech into text, works out what you want, and speaks the answer back to you. AIN Shop does not record, save or store your audio or the words of your conversation. The AI provider handles this data under its own business terms. OpenAI says data sent through its API is not used to train its models and may be kept for up to 30 days to prevent abuse.</p>
<h2>Product searches</h2>
<p>What you ask for (for example “black running shoes, size 10”) is sent to the AI provider’s web search to find products. Our server then reads the public pages of the stores it found to check price and stock. When we turn them on, your search words may also go to official store or affiliate programs (for example Walmart’s affiliate program). Stores see our server, not you, until you choose to open their page. Search results are kept for a few hours so the same search is faster. They are not linked to you.</p>
<h2>Camera, photos and barcodes</h2>
<p>The camera turns on only when you ask. A photo you take to identify a product is sent to the AI provider and is not stored by us. A barcode number is sent to a product database (UPCitemdb) to find the product. We keep barcode lookups by barcode number only, not linked to you.</p>
<h2>Location (optional)</h2>
<p>To suggest stores near you, AIN Shop can use your approximate city, worked out from your internet address by our hosting provider. If you ask for your exact location, your phone asks your permission first. Your position is rounded (to about 1 km) and turned into a city name by OpenStreetMap. That city lookup is kept for up to 7 days by rounded position only, not linked to you.</p>
<h2>What we keep on our server</h2>
<ul>
<li><b>Fair-use counters:</b> daily counts (how many conversations, minutes and searches), linked to a scrambled (hashed) form of your internet address, never the address itself. They expire after about 2 days.</li>
<li><b>Conversation log:</b> for each AI conversation, the date, time, length, language, why it ended and its cost. No words, no audio, no internet address.</li>
<li><b>Visitor count:</b> once a day, a scrambled form of a random number your device makes, the type of device (for example iPhone) and the language.</li>
<li><b>Stores that join:</b> the details a store sends us on the join page (store name, website, email, product feed, note).</li>
</ul>
<p>The conversation log and the visitor count are deleted automatically after {RETAIN}.</p>
<h2>What stays on your device</h2>
<p>AIN Shop saves a few things in your browser’s local storage: your language, whether you saw the first-use notice, your shopping list, the last store checkout (for 6 hours), your voice settings, the random visitor number, and — when subscriptions are turned on — your membership status. App files are also saved so the app opens faster. You can delete all of this by clearing website data for ainshop.sites.tab.bot in your phone’s settings, or by removing the app.</p>
<h2>Cookies</h2>
<p>AIN Shop uses no advertising or tracking cookies. Shoppers get no cookie today. When subscriptions are turned on, one first-party cookie will hold a random membership number; we store only a scrambled form of it. The owner’s admin page uses one sign-in cookie.</p>
<h2>Affiliate links</h2>
<p>Some links to stores may be affiliate links. If you buy through one, the store may know the visit came from AIN Shop and may pay us a commission, at no extra cost to you. Once you open a store’s page, that store’s own privacy policy applies.</p>
<h2>Payments</h2>
<p>AIN Shop never sees your card or payment details. You pay on the store’s own page (for example with Apple Pay). If we start the planned subscription, payment will be handled by Apple’s App Store, Google Play or a payment company such as Stripe. We will only receive the status of the subscription (for example active, and until when), not your card.</p>
<h2>Who we share with</h2>
<p>Only the services named above, so that AIN Shop can work: the AI provider, our hosting provider, OpenStreetMap, the product database, stores and affiliate programs, and (later) the payment provider. We do not sell or share your information for advertising. We may share information if the law requires it.</p>
<h2>Children</h2>
<p>AIN Shop is not made for children under 13, and we do not knowingly collect information from them. If you think a child sent us information, email us and we will delete it.</p>
<h2>Your choices and deleting your data</h2>
<p>Because there is no account, most of what we keep is not linked to you. To delete anything we can link to you (for example a store’s join request), or to ask a question about your data, email {DEL_MAIL}. We will answer and delete it within 30 days. You can delete what is on your device at any time, as explained above.</p>
<h2>Security</h2>
<p>All connections use HTTPS. Service keys stay on our server, never in the app. Only the owner can open the admin page.</p>
<h2>Changes</h2>
<p>If this policy changes, we will update this page and the date at the top.</p>
<h2>Contact</h2>
<p>{O['name']}, {O['place']} · {MAIL}</p>
"""

PRIVACY_HE = f"""
<h1>מדיניות פרטיות</h1>
<p class="upd">עודכן לאחרונה: {O['updated_he']}</p>
<p>AIN Shop הוא עוזר קניות קולי, שנוצר על ידי {WHO_HE} (“אנחנו”). בדף הזה מוסבר בפשטות מה AIN Shop עושה עם המידע שלכם.</p>
<h2>בקצרה</h2>
<ul>
<li>אין חשבון. אנחנו לא מבקשים שם, אימייל או מספר טלפון.</li>
<li>אנחנו לא מקליטים ולא שומרים את הקול שלכם.</li>
<li>אין פרסומות ואין כלי ניתוח או מעקב.</li>
<li>אנחנו אף פעם לא מוכרים את המידע שלכם.</li>
</ul>
<h2>הקול שלכם</h2>
<p>כשאתם לוחצים על כפתור הדיבור, הקול מהמיקרופון נשלח בזמן אמת לספק בינה מלאכותית (כיום: OpenAI). הוא הופך את הדיבור לטקסט, מבין מה אתם מבקשים, ומשמיע לכם את התשובה. AIN Shop לא מקליט, לא שומר ולא מאחסן את הקול או את מילות השיחה. ספק הבינה המלאכותית מטפל במידע לפי תנאי השימוש העסקיים שלו. לפי OpenAI, מידע שעובר דרך ה-API שלה לא משמש לאימון המודלים, ועשוי להישמר עד 30 יום למניעת שימוש לרעה.</p>
<h2>חיפוש מוצרים</h2>
<p>מה שאתם מבקשים (למשל “נעלי ריצה שחורות, מידה 43”) נשלח לחיפוש הרשת של ספק הבינה המלאכותית כדי למצוא מוצרים. לאחר מכן השרת שלנו קורא את הדפים הציבוריים של החנויות שנמצאו כדי לבדוק מחיר ומלאי. כשנפעיל זאת, מילות החיפוש עשויות להישלח גם לתוכניות רשמיות של חנויות או של שותפים (למשל תוכנית השותפים של Walmart). החנויות רואות את השרת שלנו, לא אתכם, עד שאתם בוחרים לפתוח את הדף שלהן. תוצאות חיפוש נשמרות לכמה שעות כדי שחיפוש חוזר יהיה מהיר. הן לא מקושרות אליכם.</p>
<h2>מצלמה, תמונות וברקודים</h2>
<p>המצלמה נדלקת רק כשאתם מבקשים. תמונה שאתם מצלמים כדי לזהות מוצר נשלחת לספק הבינה המלאכותית ואינה נשמרת אצלנו. מספר ברקוד נשלח למאגר מוצרים (UPCitemdb) כדי למצוא את המוצר. אנחנו שומרים חיפושי ברקוד לפי מספר הברקוד בלבד, לא מקושרים אליכם.</p>
<h2>מיקום (לא חובה)</h2>
<p>כדי להציע חנויות בקרבתכם, AIN Shop יכול להשתמש בעיר המשוערת שלכם, שספק האחסון שלנו מסיק מכתובת האינטרנט. אם תבקשו מיקום מדויק, הטלפון יבקש את רשותכם קודם. המיקום מעוגל (לכקילומטר אחד) ומתורגם לשם עיר על ידי OpenStreetMap. התרגום הזה נשמר עד 7 ימים לפי המיקום המעוגל בלבד, לא מקושר אליכם.</p>
<h2>מה נשמר בשרת שלנו</h2>
<ul>
<li><b>מונים לשימוש הוגן:</b> ספירות יומיות (כמה שיחות, דקות וחיפושים), המקושרות לגרסה מעורבלת (hash) של כתובת האינטרנט שלכם, אף פעם לא לכתובת עצמה. הן נמחקות אחרי כיומיים.</li>
<li><b>יומן שיחות:</b> לכל שיחה עם הבינה המלאכותית — תאריך, שעה, אורך, שפה, למה הסתיימה ועלות. בלי מילים, בלי קול, בלי כתובת אינטרנט.</li>
<li><b>ספירת מבקרים:</b> פעם ביום, גרסה מעורבלת של מספר אקראי שהמכשיר שלכם יוצר, סוג המכשיר (למשל iPhone) והשפה.</li>
<li><b>חנויות שמצטרפות:</b> הפרטים שחנות שולחת בדף ההצטרפות (שם החנות, אתר, אימייל, קובץ מוצרים, הערה).</li>
</ul>
<p>יומן השיחות וספירת המבקרים נמחקים אוטומטית אחרי {RETAIN_HE}.</p>
<h2>מה נשאר במכשיר שלכם</h2>
<p>AIN Shop שומר כמה דברים באחסון המקומי של הדפדפן: השפה, האם ראיתם את ההודעה הראשונה, רשימת הקניות, הקנייה האחרונה בחנות (ל-6 שעות), הגדרות הקול, מספר המבקר האקראי, וכשהמנויים יופעלו — מצב המנוי. גם קבצי האפליקציה נשמרים כדי שתיפתח מהר יותר. אפשר למחוק את כל זה בניקוי נתוני האתר ainshop.sites.tab.bot בהגדרות הטלפון, או בהסרת האפליקציה.</p>
<h2>עוגיות (Cookies)</h2>
<p>AIN Shop לא משתמש בעוגיות פרסום או מעקב. כיום קונים לא מקבלים שום עוגייה. כשהמנויים יופעלו, עוגייה אחת של האתר עצמו תחזיק מספר מנוי אקראי; אנחנו שומרים רק גרסה מעורבלת שלו. דף הניהול של הבעלים משתמש בעוגיית כניסה אחת.</p>
<h2>קישורי שותפים</h2>
<p>חלק מהקישורים לחנויות עשויים להיות קישורי שותפים. אם תקנו דרך קישור כזה, החנות עשויה לדעת שהגעתם מ-AIN Shop ולשלם לנו עמלה, בלי עלות נוספת עבורכם. מרגע שפתחתם את דף החנות, חלה מדיניות הפרטיות של החנות.</p>
<h2>תשלומים</h2>
<p>AIN Shop אף פעם לא רואה את פרטי הכרטיס או התשלום שלכם. התשלום נעשה בדף של החנות עצמה (למשל ב-Apple Pay). אם נפעיל את המנוי המתוכנן, התשלום יטופל על ידי App Store של Apple, Google Play או חברת תשלומים כמו Stripe. נקבל רק את מצב המנוי (למשל פעיל, ועד מתי), לא את הכרטיס.</p>
<h2>עם מי אנחנו משתפים</h2>
<p>רק עם השירותים שהוזכרו למעלה, כדי ש-AIN Shop יעבוד: ספק הבינה המלאכותית, ספק האחסון, OpenStreetMap, מאגר המוצרים, חנויות ותוכניות שותפים, ו(בהמשך) ספק התשלומים. אנחנו לא מוכרים ולא משתפים מידע לצורכי פרסום. ייתכן שנמסור מידע אם החוק מחייב זאת.</p>
<h2>ילדים</h2>
<p>AIN Shop אינו מיועד לילדים מתחת לגיל 13, ואנחנו לא אוספים מהם מידע ביודעין. אם אתם חושבים שילד שלח לנו מידע, כתבו לנו ונמחק אותו.</p>
<h2>הבחירות שלכם ומחיקת מידע</h2>
<p>מכיוון שאין חשבון, רוב מה שאנחנו שומרים לא מקושר אליכם. כדי למחוק כל דבר שאפשר לקשר אליכם (למשל בקשת הצטרפות של חנות), או לשאול על המידע שלכם, כתבו ל-{DEL_MAIL}. נענה ונמחק תוך 30 יום. את מה ששמור במכשיר אפשר למחוק בכל זמן, כמו שהוסבר למעלה.</p>
<h2>אבטחה</h2>
<p>כל החיבורים מוצפנים ב-HTTPS. מפתחות השירות נשמרים בשרת שלנו, אף פעם לא באפליקציה. רק הבעלים יכול לפתוח את דף הניהול.</p>
<h2>שינויים</h2>
<p>אם המדיניות תשתנה, נעדכן את הדף הזה ואת התאריך בראשו.</p>
<h2>יצירת קשר</h2>
<p>{O['name_he']} ({O['name']}), {O['place_he']} · {MAIL}</p>
"""

TERMS_EN = f"""
<h1>Terms of Use</h1>
<p class="upd">Last updated: {O['updated']}</p>
<p>These terms are an agreement between you and {WHO_EN} (“we”), the maker of AIN Shop. By using AIN Shop you agree to them. If you do not agree, please do not use AIN Shop.</p>
<h2>1. What AIN Shop is</h2>
<p>AIN Shop is a voice shopping assistant. You say what you need, it finds products from stores on the web, reads you the options, and sends you to the store’s own page to buy. It is built to be easy for people who are blind or have low vision.</p>
<h2>2. AIN Shop is not the seller</h2>
<p>AIN Shop does not sell anything, take payments, ship orders or handle returns. You buy directly from the store, under that store’s terms, prices and policies. Questions about an order, delivery, refund or warranty go to the store.</p>
<h2>3. Prices and stock</h2>
<p>Product details, prices and stock come from the stores and the web. They can change at any time and can be wrong or out of date. The store’s own page at checkout is final. Please check it before you pay.</p>
<h2>4. Affiliate links</h2>
<p>Some store links may be affiliate links. If you buy through one, AIN Shop may earn a commission from the store, at no extra cost to you. This never changes the price you pay.</p>
<h2>5. Price of AIN Shop</h2>
<p>AIN Shop is free to use right now, with daily usage limits. We plan to offer a subscription for shoppers at {O['price']} per month, with a free trial. This is not active yet. Before it starts, the price and terms will be shown in the app, and you will only be charged if you choose to subscribe. When enabled, the subscription will be billed through Apple’s App Store, Google Play or a payment company, will renew each month until you cancel, and can be cancelled at any time in your store account settings. Stores can join AIN Shop for free.</p>
<h2>6. AI can make mistakes</h2>
<p>AIN Shop uses artificial intelligence to understand you and to find and describe products. It can mishear you, misunderstand, or give wrong or incomplete information. Always check important details — such as size, color, ingredients, allergens, safety or compatibility — on the store’s page or with the store before you buy. AIN Shop does not give medical, legal or financial advice.</p>
<h2>7. Acceptable use</h2>
<ul>
<li>Use AIN Shop only for lawful, personal shopping help.</li>
<li>Do not try to break, overload, scrape or get around the limits or security of AIN Shop.</li>
<li>Do not use it to harass anyone or to look for illegal goods.</li>
<li>Do not copy or resell AIN Shop or its content.</li>
</ul>
<p>We may limit or stop access for anyone who misuses AIN Shop.</p>
<h2>8. Other websites</h2>
<p>AIN Shop links to stores and other websites that we do not control. We are not responsible for their content, products, prices, privacy or service.</p>
<h2>9. Availability</h2>
<p>We try to keep AIN Shop working, but it may be slow, limited or unavailable at times, and features may change or end.</p>
<h2>10. No warranty</h2>
<p>AIN Shop is provided “as is” and “as available”, without warranties of any kind, to the fullest extent allowed by law.</p>
<h2>11. Limitation of liability</h2>
<p>To the fullest extent allowed by law, we are not liable for indirect, incidental, special or consequential damages, or for any loss from a purchase you make from a store. Our total liability for any claim about AIN Shop is limited to the greater of the amount you paid us in the 12 months before the claim or 50 US dollars. Some places do not allow these limits, so they may not apply to you.</p>
<h2>12. App stores</h2>
<p>If you got AIN Shop from Apple’s App Store or Google Play, that store’s own rules also apply. Apple and Google are not responsible for AIN Shop or its support.</p>
<h2>13. Law</h2>
<p>These terms are governed by the laws of the State of Michigan, USA. Any dispute will be handled in the state or federal courts located in Michigan, unless the law where you live gives you other rights.</p>
<h2>14. Changes</h2>
<p>We may update these terms. We will change the date at the top, and continuing to use AIN Shop means you accept the new terms.</p>
<h2>15. Contact</h2>
<p>{O['name']}, {O['place']} · {MAIL}</p>
"""

TERMS_HE = f"""
<h1>תנאי שימוש</h1>
<p class="upd">עודכן לאחרונה: {O['updated_he']}</p>
<p>תנאים אלה הם הסכם בינכם לבין {WHO_HE} (“אנחנו”), יוצר AIN Shop. השימוש ב-AIN Shop מהווה הסכמה לתנאים. אם אינכם מסכימים, אנא אל תשתמשו ב-AIN Shop.</p>
<h2>1. מה זה AIN Shop</h2>
<p>AIN Shop הוא עוזר קניות קולי. אומרים מה צריך, והוא מוצא מוצרים מחנויות ברשת, מקריא את האפשרויות, ושולח אתכם לדף של החנות עצמה כדי לקנות. הוא בנוי להיות נוח לאנשים עיוורים או עם ראייה ירודה.</p>
<h2>2. AIN Shop אינו המוכר</h2>
<p>AIN Shop לא מוכר דבר, לא גובה תשלום, לא שולח הזמנות ולא מטפל בהחזרות. אתם קונים ישירות מהחנות, לפי התנאים, המחירים והמדיניות שלה. שאלות על הזמנה, משלוח, החזר או אחריות — לחנות.</p>
<h2>3. מחירים ומלאי</h2>
<p>פרטי המוצרים, המחירים והמלאי מגיעים מהחנויות ומהרשת. הם יכולים להשתנות בכל רגע ועלולים להיות שגויים או לא מעודכנים. הדף של החנות בשלב התשלום הוא הקובע. אנא בדקו אותו לפני שאתם משלמים.</p>
<h2>4. קישורי שותפים</h2>
<p>חלק מהקישורים לחנויות עשויים להיות קישורי שותפים. אם תקנו דרך קישור כזה, AIN Shop עשוי לקבל עמלה מהחנות, בלי עלות נוספת עבורכם. זה אף פעם לא משנה את המחיר שאתם משלמים.</p>
<h2>5. המחיר של AIN Shop</h2>
<p>כרגע השימוש ב-AIN Shop חינם, עם מגבלת שימוש יומית. אנחנו מתכננים להציע מנוי לקונים ב-{O['price']} לחודש, עם תקופת ניסיון חינם. זה עדיין לא פעיל. לפני שזה יתחיל, המחיר והתנאים יוצגו באפליקציה, ותחויבו רק אם תבחרו להירשם. כשיופעל, המנוי יחויב דרך App Store של Apple, Google Play או חברת תשלומים, יתחדש כל חודש עד שתבטלו, ואפשר לבטל אותו בכל זמן בהגדרות החשבון בחנות האפליקציות. חנויות יכולות להצטרף ל-AIN Shop בחינם.</p>
<h2>6. בינה מלאכותית יכולה לטעות</h2>
<p>AIN Shop משתמש בבינה מלאכותית כדי להבין אתכם ולמצוא ולתאר מוצרים. הוא עלול לשמוע לא נכון, לא להבין, או לתת מידע שגוי או חלקי. תמיד בדקו פרטים חשובים — כמו מידה, צבע, רכיבים, אלרגנים, בטיחות או התאמה — בדף החנות או מול החנות לפני הקנייה. AIN Shop אינו נותן ייעוץ רפואי, משפטי או כספי.</p>
<h2>7. שימוש מותר</h2>
<ul>
<li>השתמשו ב-AIN Shop רק לעזרה חוקית ואישית בקניות.</li>
<li>אל תנסו לשבור, להעמיס, לגרד מידע או לעקוף את המגבלות או האבטחה של AIN Shop.</li>
<li>אל תשתמשו בו כדי להטריד אחרים או לחפש מוצרים לא חוקיים.</li>
<li>אל תעתיקו ואל תמכרו מחדש את AIN Shop או את התוכן שלו.</li>
</ul>
<p>אנחנו רשאים להגביל או לחסום גישה למי שמשתמש ב-AIN Shop לרעה.</p>
<h2>8. אתרים אחרים</h2>
<p>AIN Shop מקשר לחנויות ולאתרים אחרים שאינם בשליטתנו. איננו אחראים לתוכן, למוצרים, למחירים, לפרטיות או לשירות שלהם.</p>
<h2>9. זמינות</h2>
<p>אנחנו משתדלים ש-AIN Shop יעבוד, אבל לפעמים הוא עלול להיות איטי, מוגבל או לא זמין, ותכונות עשויות להשתנות או להיפסק.</p>
<h2>10. ללא אחריות</h2>
<p>AIN Shop ניתן “כמות שהוא” ו“לפי זמינות”, ללא אחריות מכל סוג, במידה המרבית שהחוק מתיר.</p>
<h2>11. הגבלת חבות</h2>
<p>במידה המרבית שהחוק מתיר, איננו אחראים לנזקים עקיפים, מקריים, מיוחדים או תוצאתיים, או לכל הפסד מקנייה שביצעתם בחנות. החבות הכוללת שלנו בכל תביעה הקשורה ל-AIN Shop מוגבלת לסכום הגבוה מבין מה ששילמתם לנו ב-12 החודשים שלפני התביעה, או 50 דולר אמריקאי. יש מקומות שאינם מתירים הגבלות כאלה, ולכן ייתכן שלא יחולו עליכם.</p>
<h2>12. חנויות אפליקציות</h2>
<p>אם קיבלתם את AIN Shop מ-App Store של Apple או מ-Google Play, גם הכללים של אותה חנות חלים. Apple ו-Google אינן אחראיות ל-AIN Shop או לתמיכה בו.</p>
<h2>13. דין</h2>
<p>על תנאים אלה חלים דיני מדינת מישיגן, ארה"ב. כל מחלוקת תידון בבתי המשפט של המדינה או הפדרליים במישיגן, אלא אם החוק במקום מגוריכם מעניק לכם זכויות אחרות.</p>
<h2>14. שינויים</h2>
<p>אנחנו רשאים לעדכן את התנאים. נשנה את התאריך בראש הדף, והמשך השימוש ב-AIN Shop פירושו הסכמה לתנאים החדשים.</p>
<p class="hint">במקרה של סתירה, הנוסח האנגלי של התנאים הוא הקובע.</p>
<h2>15. יצירת קשר</h2>
<p>{O['name_he']} ({O['name']}), {O['place_he']} · {MAIL}</p>
"""

CONTACT_EN = f"""
<h1>Contact and help</h1>
<p>AIN Shop is made by {WHO_EN}. We are happy to help.</p>
<p><a class="big mailbtn" href="{HELP_MAIL}">Email us: {O['email']}</a></p>
<h2>How to get help</h2>
<ul>
<li>Write to {MAIL}. Plain words are fine — you can dictate the email by voice.</li>
<li>Tell us what you tried, what happened, and your phone type (for example iPhone).</li>
<li>We usually answer within 2 business days.</li>
</ul>
<h2>Questions about an order</h2>
<p>AIN Shop does not sell or ship products. For an order, delivery, refund or warranty, please contact the store you bought from.</p>
<h2>Delete your data</h2>
<p>AIN Shop has no accounts, and it does not keep your voice. To ask us to delete anything we hold that can be linked to you, email {DEL_MAIL} with the subject “Delete my data”. We will delete it within 30 days and tell you when it is done. To delete what is saved on your phone (language, shopping list, settings), clear website data for ainshop.sites.tab.bot in your phone’s settings, or remove the app.</p>
<h2>Stores</h2>
<p>Do you run a store? <a href="/join">Join AIN Shop for free</a>.</p>
<p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a></p>
"""

CONTACT_HE = f"""
<h1>יצירת קשר ועזרה</h1>
<p>AIN Shop נוצר על ידי {WHO_HE}. נשמח לעזור.</p>
<p><a class="big mailbtn" href="{HELP_MAIL}">כתבו לנו: {O['email']}</a></p>
<h2>איך מקבלים עזרה</h2>
<ul>
<li>כתבו ל-{MAIL}. מספיק במילים פשוטות — אפשר להכתיב את המייל בקול.</li>
<li>ספרו לנו מה ניסיתם, מה קרה, ואיזה טלפון יש לכם (למשל iPhone).</li>
<li>בדרך כלל אנחנו עונים תוך 2 ימי עסקים.</li>
</ul>
<h2>שאלות על הזמנה</h2>
<p>AIN Shop לא מוכר ולא שולח מוצרים. בנוגע להזמנה, משלוח, החזר או אחריות — פנו לחנות שממנה קניתם.</p>
<h2>מחיקת המידע שלכם</h2>
<p>ב-AIN Shop אין חשבונות, והוא לא שומר את הקול שלכם. כדי לבקש שנמחק כל דבר שאפשר לקשר אליכם, כתבו ל-{DEL_MAIL} עם הנושא “מחיקת המידע שלי”. נמחק תוך 30 יום ונודיע לכם כשזה נעשה. כדי למחוק את מה ששמור בטלפון (שפה, רשימת קניות, הגדרות), נקו את נתוני האתר ainshop.sites.tab.bot בהגדרות הטלפון, או הסירו את האפליקציה.</p>
<h2>חנויות</h2>
<p>יש לכם חנות? <a href="/join">הצטרפו ל-AIN Shop בחינם</a>.</p>
<p><a href="/privacy">מדיניות פרטיות</a> · <a href="/terms">תנאי שימוש</a></p>
"""

PAGES = {
    "privacy": ("Privacy Policy", "מדיניות פרטיות", PRIVACY_EN, PRIVACY_HE),
    "terms": ("Terms of Use", "תנאי שימוש", TERMS_EN, TERMS_HE),
    "contact": ("Contact", "יצירת קשר", CONTACT_EN, CONTACT_HE),
}
NAV_EN = '<nav class="legalNav" aria-label="AIN Shop information"><a href="/">← Back to AIN Shop</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Contact</a></nav>'
NAV_HE = '<nav class="legalNav" aria-label="מידע על AIN Shop"><a href="/">חזרה ל-AIN Shop ←</a> · <a href="/privacy">פרטיות</a> · <a href="/terms">תנאי שימוש</a> · <a href="/contact">צור קשר</a></nav>'

TEMPLATE = """<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8">
<script>/* plain http:// → https:// (the host answers both; the microphone, camera and wake lock need https) */ if (location.protocol === 'http:' && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(location.hostname)) location.replace('https://' + location.host + location.pathname + location.search + location.hash);</script>
<meta name="referrer" content="strict-origin-when-cross-origin">
<script>/* security: this page must never be shown inside another site's frame (click-jacking) */ if (window.top !== window.self) {{ try {{ window.top.location.replace(window.self.location.href); }} catch (e) {{ document.documentElement.style.display = 'none'; }} }}</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="AIN Shop – {title_en}">
<title>AIN Shop – {title_en}</title><link rel="stylesheet" href="/styles.css">
<style>
header.top .brand {{ color: var(--fg); text-decoration: none; font-weight: 800; font-size: 1.3em; }}
main {{ max-width: 680px; margin: 0 auto; padding: 16px 18px 40px; font-size: 1em; line-height: 1.55; overflow-wrap: anywhere; }}
main h1 {{ font-size: 1.5em; margin: 8px 0 4px; }} main h2 {{ font-size: 1.2em; margin: 26px 0 6px; }}
main a {{ color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }}
main a:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 3px; }}
main li {{ margin: 8px 0; }} main ul {{ padding-inline-start: 1.3em; }}
.upd {{ color: var(--muted); font-size: .9em; margin-top: 0; }}
.legalNav {{ margin: 6px 0 14px; font-size: .95em; line-height: 2; }}
.legalNav a, footer.legalFoot a {{ display: inline-flex; align-items: center; min-height: 44px; padding: 0 2px; }}
.mailbtn {{ display: inline-block; padding: 14px 18px; border-radius: 12px; border: 2px solid var(--accent); text-decoration: none !important; font-weight: 700; font-size: 1em; color: var(--accent); }}
footer.legalFoot {{ max-width: 680px; margin: 0 auto; padding: 0 18px 32px; font-size: 1rem; }}
</style></head>
<body>
<header class="top"><a href="/" class="brand">AIN Shop</a><button id="langBtn" type="button" class="small">עברית</button></header>
<main>
<section id="en" lang="en" dir="ltr">{nav_en}{body_en}{nav_en_end}</section>
<section id="he" lang="he" dir="rtl" hidden>{nav_he}{body_he}{nav_he_end}</section>
</main>
<script src="/i18n.js"></script>
<script>
(function () {{
  // this page exists in English and Hebrew; the app's other 48 languages see English with a one-line note in their own language
  var I = window.BAIN_I18N, saved = null; try {{ saved = localStorage.getItem('bain:lang'); }} catch (e) {{}}
  var app = I.code(new URLSearchParams(location.search).get('lang')) || I.code(saved) || I.pick(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  var lang = (app === 'he' || app === 'yi') ? 'he' : 'en';
  var main = document.querySelector('main'), note = document.createElement('p');
  note.className = 'legalNote'; note.id = 'legalNote';
  if (app !== 'en' && app !== 'he') {{ I.set(app); note.textContent = I.t('legalNote'); note.setAttribute('lang', app); note.setAttribute('dir', I.dir()); main.insertBefore(note, main.firstChild); }}
  function apply() {{ document.getElementById('en').hidden = lang !== 'en'; document.getElementById('he').hidden = lang !== 'he'; document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    var b = document.getElementById('langBtn'); b.textContent = lang === 'he' ? 'English' : 'עברית'; b.setAttribute('lang', lang === 'he' ? 'en' : 'he'); b.setAttribute('aria-label', lang === 'he' ? 'Read this page in English' : 'קראו את הדף בעברית'); document.title = 'AIN Shop – ' + (lang === 'he' ? {title_he_js} : {title_en_js}); }}
  // switching this page between English and Hebrew does not change the app language the person chose
  document.getElementById('langBtn').addEventListener('click', function () {{ lang = lang === 'he' ? 'en' : 'he'; apply(); }});
  apply();
}})();
</script>
</body></html>
"""
import json
here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, "..", "site", "pages")
for slug, (ten, the, ben, bhe) in PAGES.items():
    page = TEMPLATE.format(title_en=html.escape(ten), title_en_js=json.dumps(ten), title_he_js=json.dumps(the, ensure_ascii=True),
                           nav_en=NAV_EN, nav_he=NAV_HE, nav_en_end=NAV_EN.replace('aria-label="AIN Shop information"', 'aria-label="AIN Shop information, end of page"'), nav_he_end=NAV_HE.replace('aria-label="מידע על AIN Shop"', 'aria-label="מידע על AIN Shop, סוף הדף"'), body_en=ben, body_he=bhe)
    open(os.path.join(out_dir, slug + ".html"), "w", encoding="utf-8").write(page)
    print("wrote", slug, len(page))
