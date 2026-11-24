package com.ainshop.app.data

// AIN Shop — the 50 languages.
// Copied from the website's language table (site/i18n.js): each language's
// own name, its English name, reading direction, and the speech locale
// used for Android speech recognition and TextToSpeech.
// RTL languages: Hebrew, Yiddish, Arabic, Persian, Urdu.

data class AppLanguage(
    val code: String,
    val name: String,
    val englishName: String,
    val rtl: Boolean,
    /** BCP-47 tag for SpeechRecognizer (EXTRA_LANGUAGE) and TTS. */
    val speechLocale: String,
)

object Languages {
    val ALL: List<AppLanguage> = listOf(
        AppLanguage("en", "English", "English", false, "en-US"),
        AppLanguage("he", "עברית", "Hebrew", true, "he-IL"),
        AppLanguage("yi", "ייִדיש", "Yiddish", true, "yi"),
        AppLanguage("ar", "العربية", "Arabic", true, "ar-SA"),
        AppLanguage("es", "Español", "Spanish", false, "es-ES"),
        AppLanguage("fr", "Français", "French", false, "fr-FR"),
        AppLanguage("de", "Deutsch", "German", false, "de-DE"),
        AppLanguage("ru", "Русский", "Russian", false, "ru-RU"),
        AppLanguage("pt", "Português", "Portuguese", false, "pt-BR"),
        AppLanguage("it", "Italiano", "Italian", false, "it-IT"),
        AppLanguage("nl", "Nederlands", "Dutch", false, "nl-NL"),
        AppLanguage("pl", "Polski", "Polish", false, "pl-PL"),
        AppLanguage("uk", "Українська", "Ukrainian", false, "uk-UA"),
        AppLanguage("cs", "Čeština", "Czech", false, "cs-CZ"),
        AppLanguage("sk", "Slovenčina", "Slovak", false, "sk-SK"),
        AppLanguage("hu", "Magyar", "Hungarian", false, "hu-HU"),
        AppLanguage("ro", "Română", "Romanian", false, "ro-RO"),
        AppLanguage("bg", "Български", "Bulgarian", false, "bg-BG"),
        AppLanguage("el", "Ελληνικά", "Greek", false, "el-GR"),
        AppLanguage("tr", "Türkçe", "Turkish", false, "tr-TR"),
        AppLanguage("fa", "فارسی", "Persian (Farsi)", true, "fa-IR"),
        AppLanguage("ur", "اردو", "Urdu", true, "ur-PK"),
        AppLanguage("hi", "हिन्दी", "Hindi", false, "hi-IN"),
        AppLanguage("bn", "বাংলা", "Bengali", false, "bn-IN"),
        AppLanguage("pa", "ਪੰਜਾਬੀ", "Punjabi", false, "pa-IN"),
        AppLanguage("ta", "தமிழ்", "Tamil", false, "ta-IN"),
        AppLanguage("te", "తెలుగు", "Telugu", false, "te-IN"),
        AppLanguage("mr", "मराठी", "Marathi", false, "mr-IN"),
        AppLanguage("gu", "ગુજરાતી", "Gujarati", false, "gu-IN"),
        AppLanguage("ja", "日本語", "Japanese", false, "ja-JP"),
        AppLanguage("ko", "한국어", "Korean", false, "ko-KR"),
        AppLanguage("vi", "Tiếng Việt", "Vietnamese", false, "vi-VN"),
        AppLanguage("th", "ไทย", "Thai", false, "th-TH"),
        AppLanguage("id", "Bahasa Indonesia", "Indonesian", false, "id-ID"),
        AppLanguage("ms", "Bahasa Melayu", "Malay", false, "ms-MY"),
        AppLanguage("tl", "Filipino", "Filipino (Tagalog)", false, "fil-PH"),
        AppLanguage("sw", "Kiswahili", "Swahili", false, "sw-KE"),
        AppLanguage("am", "አማርኛ", "Amharic", false, "am-ET"),
        AppLanguage("sv", "Svenska", "Swedish", false, "sv-SE"),
        AppLanguage("nb", "Norsk bokmål", "Norwegian (Bokmål)", false, "nb-NO"),
        AppLanguage("da", "Dansk", "Danish", false, "da-DK"),
        AppLanguage("fi", "Suomi", "Finnish", false, "fi-FI"),
        AppLanguage("hr", "Hrvatski", "Croatian", false, "hr-HR"),
        AppLanguage("sr", "Српски", "Serbian", false, "sr-RS"),
        AppLanguage("sl", "Slovenščina", "Slovenian", false, "sl-SI"),
        AppLanguage("lt", "Lietuvių", "Lithuanian", false, "lt-LT"),
        AppLanguage("lv", "Latviešu", "Latvian", false, "lv-LV"),
        AppLanguage("et", "Eesti", "Estonian", false, "et-EE"),
        AppLanguage("zh-CN", "简体中文", "Chinese (Simplified, Mandarin)", false, "zh-CN"),
        AppLanguage("zh-TW", "繁體中文", "Chinese (Traditional, Mandarin)", false, "zh-TW"),
    )

    fun byCode(code: String): AppLanguage =
        ALL.firstOrNull { it.code == code } ?: ALL.first { it.code == "en" }

    /** Pick from the phone's own language list, like the website does. */
    fun pickFromDevice(locales: List<String>): AppLanguage {
        for (tag in locales) {
            val base = tag.substringBefore('-').lowercase()
            ALL.firstOrNull { it.code == tag }?.let { return it }
            ALL.firstOrNull { it.code == base }?.let { return it }
            if (base == "zh") {
                return if (tag.contains("Hant", ignoreCase = true) || tag.contains("TW", ignoreCase = true) ||
                    tag.contains("HK", ignoreCase = true)
                ) byCode("zh-TW") else byCode("zh-CN")
            }
            if (base == "iw") return byCode("he")
            if (base == "in") return byCode("id")
            if (base == "no" || base == "nn") return byCode("nb")
            if (base == "fil") return byCode("tl")
        }
        return byCode("en")
    }

    /** A–Z by the name shown (each language's own name), like the website. */
    fun sorted(): List<AppLanguage> = ALL.sortedBy { it.name }
}
