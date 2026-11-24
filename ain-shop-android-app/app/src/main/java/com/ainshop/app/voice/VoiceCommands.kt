package com.ainshop.app.voice

import com.ainshop.app.data.Product
import java.text.Normalizer

// AIN Shop — understanding what the shopper said, on the phone.
// A Kotlin port of the website's forgiving understanding (site/intent.js):
// normalize (lower case, no accents, punctuation → spaces), fix the
// phrases speech-to-text is known to mishear in a shopping app, ignore
// the stock words it invents for silence, and match commands forgivingly
// (one letter off, a cut-off word, filler words between).
// Anything this local parser doesn't know goes to the server's
// /api/ai/intent as a fallback (see AppViewModel) — nothing is trained.

sealed class VoiceAction {
    data class Search(val query: String) : VoiceAction()
    object More : VoiceAction()
    object Previous : VoiceAction()
    object GoBack : VoiceAction()
    object StartOver : VoiceAction()
    object Stop : VoiceAction()
    data class OpenResult(val index: Int) : VoiceAction()
    data class DescribeResult(val index: Int) : VoiceAction()
    data class AddToList(val index: Int?) : VoiceAction()
    data class RememberWatch(val index: Int?, val targetPrice: Double?) : VoiceAction()
    object CheckWatchlist : VoiceAction()
    data class GoToStore(val name: String) : VoiceAction()
    object AllStores : VoiceAction()
    object MyList : VoiceAction()
    object BuyAgain : VoiceAction()
    data class Reorder(val name: String) : VoiceAction()
    data class TrackOrder(val store: String?) : VoiceAction()
    data class ReturnItem(val store: String?) : VoiceAction()
    object Deals : VoiceAction()
    object Roundup : VoiceAction()
    object StoresNearMe : VoiceAction()
    data class FastestDelivery(val query: String?) : VoiceAction()
    object Help : VoiceAction()
    object Settings : VoiceAction()
    data class SetLanguage(val code: String?) : VoiceAction()
    data class SetSpeed(val speed: String) : VoiceAction()
    object ForgetLocation : VoiceAction()
    object DeleteData : VoiceAction()
    data class Feedback(val verdict: String, val index: Int?) : VoiceAction()
    data class ReportMistake(val index: Int?) : VoiceAction()
    /** "What do buyers say about this?" — read reviews aloud for one result. */
    data class ReadReviews(val index: Int) : VoiceAction()
    /** "Compare the first one and the second one" — two result indices. */
    data class Compare(val first: Int, val second: Int) : VoiceAction()
    /** "Is there a coupon for Walmart?" — store name, if one was said. */
    data class FindCoupon(val store: String?) : VoiceAction()
    /** "Call Walmart" — opens the dialer with the store's public number. */
    data class CallStore(val store: String?) : VoiceAction()
    /** "Was this cheaper before?" — price history for one result. */
    data class PriceHistory(val index: Int) : VoiceAction()
    /** "Tell me about Walmart" — store facts spoken aloud; null = the store
     *  on screen (active store or current result), else the app asks which. */
    data class TellAboutStore(val store: String?) : VoiceAction()
    /** "My shirt size is large" — kind: shirt | pantsWaist | pantsLength | shoe. */
    data class SetSize(val kind: String, val value: String) : VoiceAction()
    /** "Show me shirts in my size" — kind: shirt | pants | shoe. */
    data class SearchInMySize(val kind: String) : VoiceAction()
    /** "What is my shirt size?" — kind null = all sizes. */
    data class MySizes(val kind: String?) : VoiceAction()
    /** "How long do I have to return this?" — return window for one result. */
    data class ReturnWindow(val index: Int) : VoiceAction()
    /** "Tell me when this is back in stock" — watch one out-of-stock result. */
    data class BackInStockWatch(val index: Int) : VoiceAction()
    /** "Is anything back in stock?" — check all stock watches now. */
    object CheckStockWatches : VoiceAction()
    /** "This barcode is oat milk" — teach an unknown barcode, on this phone only. */
    data class TeachBarcode(val name: String) : VoiceAction()
    /** "Take it" — take the photo in the camera screen. */
    object TakePhoto : VoiceAction()
    /** "This is in aisle 5" / "it's on shelf 3 in aisle 5" — teach where
     *  the current item sits in the store. Shared only after a voice yes. */
    data class TeachAisle(val aisle: String, val shelf: String) : VoiceAction()
    /** "Where is this in the store?" / "which aisle is this in?" */
    data class AskAisle(val index: Int) : VoiceAction()
    /** "Owner page" — the owner usage numbers, behind the owner PIN. */
    object Owner : VoiceAction()
    /** "Read the numbers" — speak the owner usage numbers aloud. */
    object ReadOwnerNumbers : VoiceAction()
    /** "My PIN is 123456" — unlock the owner page by voice. The PIN is
     *  never stored; only the session cookie is kept. */
    data class OwnerLogin(val pin: String) : VoiceAction()
    /** "Add Walmart to my favorites" / "Walmart is my favorite store". */
    data class AddFavorite(val store: String) : VoiceAction()
    /** "Remove Walmart from my favorites". */
    data class RemoveFavorite(val store: String) : VoiceAction()
    /** "What are my favorite stores?" */
    object ListFavorites : VoiceAction()
    object MiniWindow : VoiceAction()
    object FullWindow : VoiceAction()
    object ConfirmYes : VoiceAction()
    object ConfirmNo : VoiceAction()
    object ScanBarcode : VoiceAction()
    object Identify : VoiceAction()
    data class WatchByWords(val query: String, val targetPrice: Double?) : VoiceAction()
    data class Unknown(val text: String) : VoiceAction()
}

object VoiceCommands {

    // ---- normalize + fix (from site/intent.js) ----

    fun normalize(raw: String): String {
        var s = raw.lowercase()
        s = Normalizer.normalize(s, Normalizer.Form.NFKD)
            .replace(Regex("[\\u0300-\\u036f]"), "")
            .replace(Regex("[\\u0591-\\u05c7]"), "")
            .replace(Regex("[\\u064b-\\u065f\\u0670]"), "")
        s = s.replace(Regex("[’'`´]"), "")
        s = s.replace(Regex("[^\\p{L}\\p{N}]+"), " ")
        return s.replace(Regex("\\s+"), " ").trim()
    }

    private val FIXES = listOf(
        Regex("\\b(my|all my|the|our|read|show|check) (cards|cars|charts|carts?|kurts|courts)\\b") to "$1 carts",
        Regex("\\b(add|put|place|move)( it| this| that| them| one)? (to|in|into) (the |my )?(card|car|chart|kart|cot)\\b") to "$1$2 $3 ${'$'}4cart",
        Regex("\\bcheck ?out\\b|\\bchuck out\\b|\\bcheckouts\\b") to "checkout",
        Regex("\\b(wall|wal|wol|whole|wool|walt) ?(mart|marts|mark|marked)\\b|\\bwalmark\\b|\\bwallmart\\b") to "walmart",
        Regex("\\btar ?(get|jet|gay|ge)\\b|\\btarge\\b") to "target",
        Regex("\\bbest (by|bye|bi|bai)\\b|\\bbestbuy\\b") to "best buy",
        Regex("\\bama ?zon s?\\b|\\bamazons\\b|\\bamazing store\\b") to "amazon",
        Regex("\\bcost ?co\\b|\\bcostcos\\b|\\bcost go\\b") to "costco",
        Regex("\\bhome depo\\b|\\bhome deep oh\\b|\\bhome debt oh\\b") to "home depot",
        Regex("\\bkro ?ger\\b|\\bkruger\\b|\\bkroeger\\b") to "kroger",
        Regex("\\bwal ?greens\\b|\\bwall greens\\b") to "walgreens",
        Regex("\\bmy ?er\\b|\\bmeyer\\b|\\bmeier\\b") to "meijer",
        Regex("\\bgo too\\b|\\bgo two\\b|\\bgoal to\\b") to "go to",
        Regex("\\bswitch two\\b|\\bswitched to\\b|\\bswish to\\b") to "switch to",
    )

    fun fix(raw: String): String {
        var t = normalize(raw)
        FIXES.forEach { (pattern, replacement) -> t = pattern.replace(t, replacement) }
        return t.replace(Regex("\\s+"), " ").trim()
    }

    // ---- silence / noise (from site/intent.js) ----

    private val STOCK = setOf(
        "you", "thank you", "thanks", "thank you very much", "thanks for watching",
        "thank you for watching", "please subscribe", "subscribe", "bye", "bye bye",
        "goodbye", "okay", "ok", "oh", "uh", "um", "umm", "hmm", "mm", "mmm", "ah",
        "eh", "huh", "hm", "beep", "music", "applause", "silence", "noise", "laughter",
        "so", "the", "and", "i", "a", "yeah", "shh", "sh", "cough", "sneeze", "ahem",
        "ugh", "oh my", "whoa", "wow", "תודה", "תודה רבה", "שלום", "ביי",
        "спасибо", "merci", "danke", "gracias", "obrigado", "grazie",
    )

    fun isNoise(text: String): Boolean {
        val t = normalize(text)
        if (t.isEmpty()) return true
        if (!t.any { it.isLetterOrDigit() }) return true
        if (t.replace(" ", "").let { it.isNotEmpty() && it.all { c -> c == it[0] } } && t.length < 6) return true
        return STOCK.contains(t)
    }

    // ---- quick commands: stop / next / back (whole utterance only) ----

    private val QUICK_STOP = setOf(
        "stop", "stop it", "stop talking", "pause", "quiet", "be quiet", "silence",
        "shh", "shush", "hush", "enough", "thats enough", "wait", "hold on", "mute",
        "עצור", "עצרי", "תעצור", "תעצרי", "הפסק", "תפסיק", "די", "שקט", "רגע",
        "חכה", "חכי", "סטופ",
    )
    private val QUICK_NEXT = setOf(
        "next", "next one", "next ones", "next three", "the next ones", "the next three",
        "more", "more results", "show more", "show me more", "next results",
        "הבא", "הבאה", "הבאים", "עוד", "עוד תוצאות", "הלאה",
    )
    private val QUICK_BACK = setOf(
        "back", "go back", "previous", "previous ones", "the previous ones",
        "previous three", "the previous three", "previous results",
        "הקודם", "הקודמים", "הקודמת", "חזור", "תחזור", "אחורה", "חזרה", "צוריק",
    )
    private val FILLER = Regex("^(?:(?:ok|okay|please|now|hey|ain|ain shop|just|so|and|oh|um|uh)\\s+)+|(?:\\s+(?:please|now|thanks|thank you|ok|okay))+$")

    fun quick(text: String): String? {
        val t = normalize(text)
        if (t.isEmpty() || t.length > 40) return null
        val u = t.replace(FILLER, "").trim().ifEmpty { t }
            .split(" ").filterIndexed { i, w -> i == 0 || w != t.split(" ")[i - 1] }.joinToString(" ")
        return when (u) {
            in QUICK_STOP -> "stop"
            in QUICK_NEXT -> "next"
            in QUICK_BACK -> "back"
            else -> null
        }
    }

    // ---- store names in other alphabets (from site/stores.js) ----

    private val STORE_ALIASES = mapOf(
        "וולמארט" to "walmart", "וולמרט" to "walmart", "טרגט" to "target",
        "טארגט" to "target", "אמזון" to "amazon", "קוסטקו" to "costco",
        "בסט ביי" to "best buy", "איקאה" to "ikea", "איביי" to "ebay",
        "וולגרינס" to "walgreens", "סי וי אס" to "cvs", "קרוגר" to "kroger",
        "מייגר" to "meijer", "הום דיפו" to "home depot",
        "وولمارت" to "walmart", "أمازون" to "amazon", "امازون" to "amazon",
        "таргет" to "target", "волмарт" to "walmart", "амазон" to "amazon",
        "コストコ" to "costco", "ウォルマート" to "walmart", "アマゾン" to "amazon",
        "沃尔玛" to "walmart", "亚马逊" to "amazon", "好市多" to "costco",
        "월마트" to "walmart", "아마존" to "amazon", "코스트코" to "costco",
    )

    // ---- reference words: "the second one", "the cheaper one" ----

    private val ORDINALS = mapOf(
        "first" to 0, "second" to 1, "third" to 2, "fourth" to 3, "fifth" to 4,
        "sixth" to 5, "seventh" to 6, "eighth" to 7, "ninth" to 8, "tenth" to 9,
        "1st" to 0, "2nd" to 1, "3rd" to 2, "4th" to 3, "5th" to 4,
        "one" to 0, "two" to 1, "three" to 2, "four" to 3, "five" to 4,
    )

    /**
     * Resolve "the second one" / "number 3" / "the cheaper one" /
     * "the most expensive one" / "that one" against the results on screen.
     * Returns the index, or null when the words name no result.
     */
    fun resolveReference(text: String, results: List<Product>, currentIndex: Int = -1): Int? {
        val t = fix(text)
        if (results.isEmpty()) return null
        Regex("number (\\d+)").find(t)?.let {
            val n = it.groupValues[1].toIntOrNull()?.minus(1)
            if (n != null && n in results.indices) return n
        }
        for ((word, index) in ORDINALS) {
            if (Regex("\\b$word\\b").containsMatchIn(t) && index in results.indices) {
                if (t.contains("one") || t.contains("result") || t.contains("item") ||
                    t.contains("number") || t == word
                ) return index
            }
        }
        if (t.contains("cheaper") || t.contains("cheapest") || t.contains("lowest price")) {
            return results.withIndex()
                .filter { it.value.price != null }
                .minByOrNull { it.value.price!! }?.index
        }
        if (t.contains("expensive") || t.contains("priciest") || t.contains("highest price")) {
            return results.withIndex()
                .filter { it.value.price != null }
                .maxByOrNull { it.value.price!! }?.index
        }
        if (t.contains("that one") || t == "that" || t.contains("this one")) {
            return if (currentIndex in results.indices) currentIndex else 0
        }
        return null
    }

    private fun priceFrom(text: String): Double? {
        val m = Regex("(?:below|under|less than|cheaper than|max(?:imum)?|up to)\\s*\\$?\\s*(\\d+(?:\\.\\d{1,2})?)")
            .find(text)
        return m?.groupValues?.get(1)?.toDoubleOrNull()
    }

    // ---- the main parse ----

    /**
     * Parse heard words into an action. `hasResults` says whether a search
     * list is on screen (so "the second one" can resolve). Anything this
     * returns as Unknown goes to the server's /api/ai/intent fallback.
     */
    fun parse(
        raw: String,
        results: List<Product> = emptyList(),
        currentIndex: Int = -1,
        favorites: List<String> = emptyList(),
    ): VoiceAction {
        if (isNoise(raw)) return VoiceAction.Unknown(raw)
        val t = fix(raw)

        // Yes / no answers to a question the app just asked.
        if (t == "yes" || t == "yeah" || t == "sure" || t == "ok" || t == "okay" ||
            t == "כן" || t == "יא" || t == "yes please"
        ) return VoiceAction.ConfirmYes
        if (t == "no" || t == "nope" || t == "not now" || t == "לא") return VoiceAction.ConfirmNo

        when (quick(raw)) {
            "stop" -> return VoiceAction.Stop
            "next" -> return VoiceAction.More
            "back" -> return VoiceAction.GoBack
        }

        if (t.contains("start over") || t.contains("new search") || t.contains("clear") ||
            t.contains("search again") || t.contains("another search") || t.contains("do another search") ||
            t.contains("one more search") || t == "go back"
        ) return VoiceAction.StartOver

        if (t.contains("mini window") || t.contains("small window") || t.contains("picture in picture") ||
            t.contains("float") && t.contains("window")
        ) return VoiceAction.MiniWindow
        if (t.contains("full screen") || t.contains("full window") || t.contains("back to full")) {
            return VoiceAction.FullWindow
        }

        if (t.contains("scan barcode") || t.contains("scan a barcode") || t == "barcode") {
            return VoiceAction.ScanBarcode
        }
        if (t.contains("what is this") || t.contains("whats this") || t.contains("what am i looking at")) {
            return VoiceAction.Identify
        }
        // "Take it" — take the photo (camera screen), or the steady detector
        // takes it by itself after two seconds of stillness.
        if (t == "take it" || t.contains("take the photo") || t.contains("take a photo") ||
            t.contains("take the picture") || t.contains("take a picture")
        ) {
            return VoiceAction.TakePhoto
        }
        // "This barcode is oat milk" — teach a barcode the app didn't know.
        Regex("^(?:remember\\s+)?this (?:barcode|bar code) is\\s+(.+)$").find(t)?.let {
            val name = it.groupValues[1].trim()
            if (name.isNotEmpty()) return VoiceAction.TeachBarcode(name)
        }

        // Aisles: "where is this in the store?" / "this is in aisle 5".
        if (t.contains("where is this in") || t.contains("which aisle") ||
            t.contains("what aisle") || t.contains("where do i find this") ||
            t.contains("where is it in the store")
        ) {
            return VoiceAction.AskAisle(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }
        // "this is in aisle 5" / "it's on aisle five" / "shelf 3 in aisle 5".
        Regex("(?:aisle|isle)\\s+(\\w+)").find(t)?.let { aisleMatch ->
            val aisleWord = aisleMatch.groupValues[1]
            val aisleNumber = aisleWord.toIntOrNull()?.toString()
                ?: mapOf("one" to "1", "two" to "2", "three" to "3", "four" to "4", "five" to "5",
                    "six" to "6", "seven" to "7", "eight" to "8", "nine" to "9", "ten" to "10")[aisleWord]
            if (aisleNumber != null && (t.contains("aisle") || t.contains("isle"))) {
                val shelf = Regex("(?:shelf|row)\\s+(\\w+)").find(t)?.groupValues?.get(1) ?: ""
                return VoiceAction.TeachAisle(aisleNumber, shelf)
            }
        }

        if (t.contains("what can i say") || t.contains("help") || t.contains("what can you do")) {
            return VoiceAction.Help
        }
        if (t.contains("settings") || t.contains("open settings")) return VoiceAction.Settings
        // Owner page: "owner numbers" / "read the numbers" / "my PIN is…".
        if (t.contains("owner page") || t.contains("owner numbers") || t.contains("owner section") ||
            t.contains("how many visitors") || t.contains("show me the numbers")
        ) return VoiceAction.Owner
        if (t.contains("read the numbers") || t.contains("read me the numbers") || t.contains("read the stats")) {
            return VoiceAction.ReadOwnerNumbers
        }
        Regex("(?:my pin is|pin is|pin)\\s+(\\d{6,12})").find(t)?.let {
            return VoiceAction.OwnerLogin(it.groupValues[1])
        }
        if (t.contains("forget my location") || t.contains("forget where i live")) {
            return VoiceAction.ForgetLocation
        }
        if (t.contains("delete my data") || t.contains("delete my account") || t.contains("erase my data")) {
            return VoiceAction.DeleteData
        }
        if (t.contains("faster") && !t.contains("delivery") && !t.contains("shipping")) {
            return VoiceAction.SetSpeed("fast")
        }
        if (t.contains("slower") || t.contains("wait longer") || t.contains("give me more time")) {
            return VoiceAction.SetSpeed("slow")
        }
        if (t.contains("normal speed")) return VoiceAction.SetSpeed("normal")

        // Feedback: "that was helpful" / "number 2 was wrong".
        if (t.contains("helpful") || t.contains("not helpful") || t.contains("was wrong") ||
            t.contains("wasnt helpful") || t.contains("wasn t helpful")
        ) {
            val verdict = when {
                t.contains("not helpful") || t.contains("wasnt helpful") || t.contains("wasn t helpful") -> "not_helpful"
                t.contains("wrong") -> "wrong"
                else -> "helpful"
            }
            return VoiceAction.Feedback(verdict, resolveReference(t, results, currentIndex))
        }
        if (t.contains("report a mistake") || t.contains("that was wrong") || t.contains("wrong item")) {
            return VoiceAction.ReportMistake(resolveReference(t, results, currentIndex))
        }

        // Watchlist.
        if (t.contains("check my watched") || t.contains("check watched") || t.contains("my watched items")) {
            return VoiceAction.CheckWatchlist
        }
        if (t.contains("remember this") || t.contains("watch this") || t.contains("remember this item")) {
            return VoiceAction.RememberWatch(resolveReference(t, results, currentIndex), priceFrom(t))
        }
        Regex("remember (?:i'?m looking for|i am looking for)\\s+(.+?)(?:\\s+(?:below|under|less than|cheaper than|max)\\s*\\$?\\s*(\\d+(?:\\.\\d{1,2})?))?$")
            .find(t)?.let {
                val query = it.groupValues[1].trim()
                val target = it.groupValues.getOrNull(2)?.toDoubleOrNull()
                if (query.isNotEmpty()) return VoiceAction.WatchByWords(query, target)
            }

        // Roundup + deals.
        if (t.contains("what dropped") || t.contains("daily roundup") || t.contains("price drops")) {
            return VoiceAction.Roundup
        }
        if (t.contains("deals") || t.contains("whats on sale") || t.contains("any deals")) {
            return VoiceAction.Deals
        }

        // Lists + Buy again + reorder.
        if (t.contains("my list") || t.contains("shopping list") || t.contains("whats on my list") ||
            t.contains("read my list") || t.contains("my cart") || t.contains("my carts")
        ) return VoiceAction.MyList
        if (t.contains("buy again") || t.contains("what did i buy")) return VoiceAction.BuyAgain
        Regex("(?:reorder|buy|order)\\s+(?:my\\s+)?(.+?)\\s+again$").find(t)?.let {
            return VoiceAction.Reorder(it.groupValues[1].trim())
        }
        Regex("^(?:add|put)\\s+(.+?)\\s+to (?:my )?(?:list|cart)$").find(t)?.let {
            return VoiceAction.AddToList(resolveReference(it.groupValues[1], results, currentIndex))
        }

        // Orders: tracking opens the store's own page.
        if (t.contains("track my") || t.contains("where is my order") || t.contains("order status") ||
            t.contains("delivery status") || t.contains("when will my order arrive")
        ) {
            return VoiceAction.TrackOrder(storeNameIn(t))
        }
        if (t.contains("return an item") || t.contains("return my order") || t.contains("send it back") ||
            t.contains("start a return")
        ) {
            return VoiceAction.ReturnItem(storeNameIn(t))
        }

        // Stores.
        if (t.contains("all stores") || t.contains("search everywhere") || t.contains("all my stores")) {
            return VoiceAction.AllStores
        }
        if (t.contains("stores near me") || t.contains("whats open near me") || t.contains("nearby stores")) {
            return VoiceAction.StoresNearMe
        }
        Regex("^(?:go to|open|switch to|take me to)\\s+(.+)$").find(t)?.let {
            val name = it.groupValues[1].trim()
            if (name.isNotEmpty() && name.split(" ").size <= 4) {
                return VoiceAction.GoToStore(translateStoreName(name))
            }
        }

        // Favorites: "add Walmart to my favorites".
        Regex("^(?:add|make)\\s+(.+?)\\s+(?:to my favorites|my favorite store|a favorite)$").find(t)?.let {
            return VoiceAction.AddFavorite(translateStoreName(it.groupValues[1].trim()))
        }
        Regex("^(?:remove|delete)\\s+(.+?)\\s+from (?:my )?favorites$").find(t)?.let {
            return VoiceAction.RemoveFavorite(translateStoreName(it.groupValues[1].trim()))
        }
        if (t.contains("my favorite stores") || t.contains("what are my favorite stores")) {
            return VoiceAction.ListFavorites
        }

        // "Tell me about the store" — store facts spoken aloud.
        if (t.contains("tell me about") || t.startsWith("about ") ||
            (t.startsWith("what is ") && storeNameIn(t) != null)
        ) {
            val name = when {
                t.contains("tell me about") ->
                    t.substringAfter("tell me about").trim()
                        .removePrefix("the ").removePrefix("this ").removePrefix("that ")
                        .ifEmpty { null }
                t.startsWith("about ") -> t.removePrefix("about ").trim().ifEmpty { null }
                else -> storeNameIn(t)
            }
            val clean = name?.let { translateStoreName(it) }
                ?.takeIf { it != "store" && it != "this store" && it != "that store" }
            return VoiceAction.TellAboutStore(clean)
        }

        // Reviews, compare, coupons, call the store, price history.
        if (t.contains("what do buyers say") || t.contains("read the reviews") ||
            t.contains("what are the reviews") || t.contains("reviews for this") ||
            t.contains("reviews of this") || t.contains("what do people say about") ||
            t.contains("buyer reviews")
        ) {
            return VoiceAction.ReadReviews(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }
        if (t.contains("compare")) {
            val pair = Comparison.pickIndices(t, results, currentIndex)
            return if (pair != null) VoiceAction.Compare(pair.first, pair.second)
            else VoiceAction.Compare(-1, -1)
        }
        if (t.contains("coupon") || t.contains("promo code") || t.contains("discount code")) {
            return VoiceAction.FindCoupon(storeNameIn(t))
        }
        if (t.startsWith("call ") || t.contains("call the store") || t.startsWith("phone ")) {
            val name = storeNameIn(t) ?: t.removePrefix("call ").removePrefix("phone ").trim().ifEmpty { null }
            return VoiceAction.CallStore(name?.let { translateStoreName(it) })
        }
        if (t.contains("was this cheaper") || t.contains("was it cheaper") ||
            t.contains("price history") || t.contains("has the price dropped") ||
            t.contains("is this the best price") || t.contains("cheaper before") ||
            t.contains("cheaper than before")
        ) {
            return VoiceAction.PriceHistory(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }

        // Sizes: "my shirt size is large" / "show me shirts in my size".
        parseSizeCommand(t, results, currentIndex)?.let { return it }

        // Return window: "how long do I have to return this?"
        if (t.contains("how long do i have to return") || t.contains("how long can i return") ||
            t.contains("return window") || t.contains("can i return this") ||
            t.contains("how long to return") || t.contains("return policy")
        ) {
            return VoiceAction.ReturnWindow(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }

        // Back in stock: "tell me when this is back in stock".
        if (t.contains("back in stock") || t.contains("when its back") || t.contains("when it comes back") ||
            t.contains("when it is back") || t.contains("come back in stock")
        ) {
            if (t.contains("check") || t.contains("anything") || t.contains("is anything")) {
                return VoiceAction.CheckStockWatches
            }
            return VoiceAction.BackInStockWatch(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }
        if (t.contains("tell me when") && t.contains("stock")) {
            return VoiceAction.BackInStockWatch(resolveReference(t, results, currentIndex) ?: currentIndex.takeIf { it in results.indices } ?: 0)
        }

        // Fastest delivery / pickup.
        if (t.contains("fastest delivery") || t.contains("fastest shipping")) {
            val query = t.replace("fastest delivery", "").replace("fastest shipping", "").trim()
            return VoiceAction.FastestDelivery(query.ifEmpty { null })
        }
        if (t.contains("pickup near me") || t.contains("pick up near me")) {
            return VoiceAction.FastestDelivery(null)
        }

        // "Open / buy / describe the second one".
        if (t.contains("describe") || t.contains("what does it look like")) {
            return VoiceAction.DescribeResult(resolveReference(t, results, currentIndex) ?: 0)
        }
        if (t.contains("open") || t.contains("buy") || t.contains("get it") || t.contains("choose")) {
            resolveReference(t, results, currentIndex)?.let { return VoiceAction.OpenResult(it) }
        }

        // "Search in England" — a place choice for this search only.
        Regex("^(?:search|shop|buy|look)(?:\\s+for\\s+.+?)?\\s+in\\s+(.+)$").find(t)?.let {
            // Handled by the ViewModel as a place-scoped search; keep the
            // whole phrase as the search so the place survives.
            return VoiceAction.Search(raw.trim())
        }

        // Everything else is a product search.
        return VoiceAction.Search(raw.trim())
    }

    // "My shirt size is large" / "show me shirts in my size" /
    // "my pants are 34 by 32" / "what is my shoe size".
    // Sizes are never guessed: if one isn't saved, the app asks.
    private fun parseSizeCommand(t: String, results: List<Product>, currentIndex: Int): VoiceAction? {
        // "show me shirts in my size" — search in the saved size.
        if (t.contains("in my size")) {
            val kind = when {
                t.contains("shirt") -> "shirt"
                t.contains("pants") || t.contains("trouser") || t.contains("jean") -> "pants"
                t.contains("shoe") || t.contains("trainer") || t.contains("sneaker") || t.contains("boot") -> "shoe"
                else -> null
            }
            if (kind != null) return VoiceAction.SearchInMySize(kind)
        }
        // "what is my shirt size?" / "what are my sizes?"
        if ((t.contains("what is my") && t.contains("size")) || t.contains("what are my sizes") ||
            t.contains("what size am i")
        ) {
            val kind = when {
                t.contains("shirt") -> "shirt"
                t.contains("pants") || t.contains("trouser") || t.contains("jean") -> "pants"
                t.contains("shoe") -> "shoe"
                else -> null
            }
            return VoiceAction.MySizes(kind)
        }
        // "my shirt size is large" (words, longest first so "extra large" wins over "large").
        if (t.contains("shirt") && t.contains("size")) {
            val sizeWords = linkedMapOf(
                "extra extra large" to "XXL", "extra large" to "XL", "x large" to "XL",
                "large" to "L", "medium" to "M", "small" to "S",
            )
            for ((word, value) in sizeWords) {
                if (t.contains(word)) return VoiceAction.SetSize("shirt", value)
            }
            Regex("shirt size is\\s+([a-z]{1,4})").find(t)?.let {
                return VoiceAction.SetSize("shirt", it.groupValues[1].uppercase())
            }
        }
        // "my shoe size is 10" / "my shoe size is 10.5".
        if (t.contains("shoe") && t.contains("size")) {
            Regex("shoe size is\\s+([0-9]+(?:\\.[05])?)").find(t)?.let {
                return VoiceAction.SetSize("shoe", it.groupValues[1])
            }
        }
        // "my pants are 34 by 32" / "my pants size is 34".
        if (t.contains("pants") || t.contains("trouser") || t.contains("jean")) {
            Regex("(\\d{2})\\s*(?:by|x)\\s*(\\d{2})").find(t)?.let {
                return VoiceAction.SetSize("pants", "${it.groupValues[1]}x${it.groupValues[2]}")
            }
            Regex("(?:pants size is|waist is|waist)\\s+(\\d{2})").find(t)?.let {
                return VoiceAction.SetSize("pantsWaist", it.groupValues[1])
            }
        }
        return null
    }

    private fun storeNameIn(t: String): String? {
        val known = listOf(
            "walmart", "target", "amazon", "costco", "best buy", "ikea", "ebay",
            "walgreens", "cvs", "kroger", "meijer", "home depot", "wayfair",
            "macys", "kohls", "lowes",
        )
        val found = known.firstOrNull { t.contains(it) }
        if (found != null) return found
        for ((alias, name) in STORE_ALIASES) {
            if (t.contains(alias)) return name
        }
        return null
    }

    private fun translateStoreName(name: String): String {
        val n = normalize(name)
        for ((alias, store) in STORE_ALIASES) {
            if (n.contains(alias)) return store
        }
        return name
    }
}
