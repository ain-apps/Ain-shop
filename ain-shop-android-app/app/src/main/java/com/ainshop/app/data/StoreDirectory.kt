package com.ainshop.app.data

// AIN Shop — the store directory: public phone numbers and the stores'
// own order-tracking and returns pages.
//
// Phone numbers were checked against public sources on 2026-11-20
// (the stores' own contact pages and customer-service listings).
// Only numbers verified that way are in here. A store with no verified
// number has phone = null, and the app says so plainly instead of
// guessing — "I don't have a public phone number for that store."
// Numbers change; the app always reads the number aloud and opens the
// phone's dialer (ACTION_DIAL) so the shopper sees it and chooses to
// call. The app never dials by itself.
//
// Order-tracking and returns pages come from the website's orders.js
// (checked Oct 30 2026). They open the store's own page; the shopper
// may need to sign in there. AIN Shop never sees orders.

data class StoreContact(
    val name: String,
    val host: String,
    /** Public customer-service number, verified 2026-11-20, or null. */
    val phone: String? = null,
    val trackUrl: String? = null,
    val returnsUrl: String? = null,
    val trackNeedsSignIn: Boolean = false,
    val returnsNeedsSignIn: Boolean = false,
    /** Standard return window, verified against published policy
     *  comparisons on 2026-11-20 (e.g. "90 days"). Null = not verified:
     *  the app says "I don't know" instead of guessing. Policies change;
     *  the store's own page is the final word. */
    val returnWindow: String? = null,
    /** Exceptions worth saying aloud (memberships, electronics, opened). */
    val returnNote: String? = null,
)

object StoreDirectory {

    val STORES: List<StoreContact> = listOf(
        StoreContact(
            "Walmart", "walmart.com", phone = "1-800-925-6278",
            trackUrl = "https://www.walmart.com/orders", trackNeedsSignIn = true,
            returnsUrl = "https://www.walmart.com/orders", returnsNeedsSignIn = true,
            returnWindow = "90 days", returnNote = "most items; opened big appliances only 48 hours",
        ),
        StoreContact(
            "Target", "target.com", phone = "1-800-440-0680",
            trackUrl = "https://www.target.com/orders", trackNeedsSignIn = true,
            returnsUrl = "https://www.target.com/returns",
            returnWindow = "90 days", returnNote = "Target-owned brands up to 1 year with a receipt; 120 days with a Target Circle Card",
        ),
        StoreContact(
            "Amazon", "amazon.com", phone = "1-888-280-4331",
            trackUrl = "https://www.amazon.com/gp/css/order-history", trackNeedsSignIn = true,
            returnsUrl = "https://www.amazon.com/gp/css/order-history", returnsNeedsSignIn = true,
            returnWindow = "30 days", returnNote = "most items",
        ),
        StoreContact(
            "Best Buy", "bestbuy.com", phone = "1-888-237-8289",
            trackUrl = "https://www.bestbuy.com/site/help-topics/how-to-track-your-order/pcmcat316000050014.c?id=pcmcat316000050014",
            returnsUrl = "https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c?id=pcmcat260800050014",
            returnWindow = "15 days", returnNote = "60 days with a My Best Buy Plus or Total membership",
        ),
        StoreContact(
            "Costco", "costco.com", phone = "1-800-774-2678",
            trackUrl = "https://customerservice.costco.com/app/answers/detail/a_id/1142",
            returnsUrl = "https://customerservice.costco.com/app/answers/answer_view/a_id/6874",
            returnWindow = "No time limit on most items", returnNote = "90 days for TVs, computers and major appliances",
        ),
        StoreContact(
            "IKEA", "ikea.com", phone = "1-800-434-4532",
            trackUrl = "https://www.ikea.com/us/en/customer-service/track-manage-order/",
            returnsUrl = "https://www.ikea.com/us/en/returns/",
            returnWindow = "365 days", returnNote = "unopened, with proof of purchase; 180 days once opened",
        ),
        StoreContact(
            "Wayfair", "wayfair.com",
            trackUrl = "https://www.wayfair.com/track_package", trackNeedsSignIn = true,
            returnsUrl = "https://www.wayfair.com/help/article/returns",
            returnWindow = "30 days", returnNote = "rugs over 299 dollars: 90 days",
        ),
        StoreContact(
            "Home Depot", "homedepot.com", phone = "1-800-466-3337",
            trackUrl = "https://www.homedepot.com/myaccount/guest-order-tracking", trackNeedsSignIn = true,
            returnsUrl = "https://www.homedepot.com/c/Return_Policy",
            returnWindow = "90 days", returnNote = "365 days with a Home Depot consumer credit card; opened big appliances 48 hours",
        ),
        StoreContact(
            "Lowe's", "lowes.com", phone = "1-800-445-6937",
            trackUrl = "https://www.lowes.com/mylowes/orders/checkorderstatus", trackNeedsSignIn = true,
            returnsUrl = "https://www.lowes.com/l/help/returns-policy",
            returnWindow = "90 days", returnNote = "opened big appliances 48 hours",
        ),
        StoreContact(
            "Macy's", "macys.com",
            trackUrl = "https://www.macys.com/customer-service/articles/how-can-i-track-my-order",
            returnsUrl = "https://www.macys.com/returns",
        ),
        StoreContact(
            "CVS", "cvs.com", phone = "1-800-746-7287",
            trackUrl = "https://www.cvs.com/retail/help/help-subtopic-order-status-tracking",
            returnsUrl = "https://www.cvs.com/retail/help/return_policy",
        ),
        StoreContact(
            "Walgreens", "walgreens.com", phone = "1-800-925-4733",
            trackUrl = "https://www.walgreens.com/orderhistory/orders-ui", trackNeedsSignIn = true,
            returnsUrl = "https://www.walgreens.com/topic/help/shophelp/returns_help_main.jsp",
        ),
        StoreContact(
            "Kroger", "kroger.com", phone = "1-800-576-4377",
            returnsUrl = "https://www.kroger.com/hc/help/returns",
        ),
        StoreContact(
            "eBay", "ebay.com",
            trackUrl = "https://www.ebay.com/mye/myebay/purchase", trackNeedsSignIn = true,
            returnsUrl = "https://www.ebay.com/help/buying/returns-refunds/return-item-refund?id=4041",
            returnWindow = "Depends on the seller", returnNote = "eBay's Money Back Guarantee runs 30 days from delivery",
        ),
        StoreContact(
            "Sam's Club", "samsclub.com",
            trackUrl = "https://help.samsclub.com/app/answers/detail/a_id/185",
            returnsUrl = "https://help.samsclub.com/app/answers/detail/a_id/128",
            returnWindow = "No time limit on most items", returnNote = "90 days for electronics and appliances",
        ),
        StoreContact(
            "Chewy", "chewy.com",
            trackUrl = "https://www.chewy.com/app/account/orderhistory", trackNeedsSignIn = true,
            returnsUrl = "https://www.chewy.com/customer-care/returns/making-a-return/start-a-return",
            returnWindow = "365 days", returnNote = "most items",
        ),
        StoreContact(
            "Etsy", "etsy.com",
            trackUrl = "https://www.etsy.com/your/purchases", trackNeedsSignIn = true,
            returnsUrl = "https://help.etsy.com/hc/en-us/articles/115015440807",
            returnWindow = "Depends on the shop", returnNote = "about 30 days on average; Etsy's Purchase Protection case window is 100 days",
        ),
        StoreContact(
            "Nordstrom", "nordstrom.com",
            trackUrl = "https://www.nordstrom.com/my-account/order-lookup", trackNeedsSignIn = true,
            returnsUrl = "https://www.nordstrom.com/browse/customer-service/return-policy",
            returnWindow = "No fixed time limit", returnNote = "handled case by case",
        ),
    )

    private fun squash(s: String): String =
        s.lowercase().replace(Regex("[^a-z0-9]"), "")

    /** "walmart", "Best Buy", "וולמארט", "lowes" → the store, or null. */
    fun byName(name: String?): StoreContact? {
        if (name.isNullOrBlank()) return null
        val q = squash(name)
        if (q.isEmpty()) return null
        // Names in other alphabets (from site/stores.js).
        val translated = when (q) {
            "וולמארט", "וולמרט", "וואלמארט", "وولمارت" -> "walmart"
            "טרגט", "טארגט", "таргет" -> "target"
            "אמזון", "أمازون", "امازون", "амазон" -> "amazon"
            "קוסטקו", "コストコ", "好市多", "코스트코" -> "costco"
            "בסטביי", "בסטבי" -> "bestbuy"
            "איקאה" -> "ikea"
            "איביי" -> "ebay"
            "וולגרינס" -> "walgreens"
            "סיוויאס" -> "cvs"
            "קרוגר" -> "kroger"
            "מייגר" -> "meijer"
            "הוםדיפו" -> "homedepot"
            else -> q
        }
        return STORES.firstOrNull {
            squash(it.name) == translated ||
                squash(it.host.substringBefore('.')) == translated ||
                squash(it.host) == translated
        }
    }

    /** A product/store URL → the store, or null. */
    fun byUrl(url: String?): StoreContact? {
        if (url.isNullOrBlank()) return null
        val host = runCatching {
            java.net.URL(url).host.lowercase().removePrefix("www.").removePrefix("m.")
        }.getOrNull() ?: return null
        return STORES.firstOrNull { host == it.host || host.endsWith("." + it.host) }
    }
}
