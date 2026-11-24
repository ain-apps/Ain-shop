package com.ainshop.app.voice

import com.ainshop.app.data.AinShopApi
import com.ainshop.app.data.Product
import com.ainshop.app.data.SearchRequest

// AIN Shop — coupons and deal codes.
// "Is there a coupon for Walmart?" / "Any coupon for these shoes?"
//
// There is no coupon database and no coupon endpoint on the server, and
// the app never invents a code. What it does: a fresh web search for
// "<store> coupon code" (or "coupon code for <product>") and reads what
// the web actually returns — the code as the page shows it, with the
// plain warning that a code from the web might not work at checkout.
// If the search finds nothing, it says so: "I couldn't find a coupon
// code for that just now." A deal the store itself advertises (a lower
// price than its old price) is different — that shows up as a deal in
// search results and in the deals summary, not here.

data class CouponLead(
    val title: String,
    val store: String,
    val url: String,
)

data class CouponResult(
    val leads: List<CouponLead>,
    /** What was searched for, so the spoken answer can say it. */
    val searchedFor: String,
)

class CouponFinder(private val api: AinShopApi) {

    suspend fun find(store: String?, product: Product?): CouponResult {
        val query = when {
            !store.isNullOrBlank() && product != null ->
                "$store coupon code for ${shortTitle(product)}"
            !store.isNullOrBlank() -> "$store coupon code"
            product != null -> "coupon code for ${shortTitle(product)}"
            else -> "coupon code"
        }
        val request = SearchRequest(query = query, country = "US", currency = "USD")
        return when (val result = api.search(request)) {
            is AinShopApi.Result.Ok -> {
                val leads = result.value.products
                    .filter { it.title.isNotBlank() && it.url.isNotBlank() }
                    .take(3)
                    .map { CouponLead(title = it.title, store = it.store, url = it.url) }
                CouponResult(leads = leads, searchedFor = query)
            }
            is AinShopApi.Result.Err -> CouponResult(leads = emptyList(), searchedFor = query)
        }
    }

    /** Spoken answer. Codes are read exactly as the web shows them, with
     *  the warning; nothing is ever made up. */
    fun speak(result: CouponResult, storeName: String?): String {
        if (result.leads.isEmpty()) {
            val what = storeName ?: "that"
            return "I couldn't find a coupon code for $what just now. " +
                "That doesn't mean there isn't one — the web just didn't show one."
        }
        val out = StringBuilder()
        out.append("Here's what I found on the web about coupon codes")
        if (storeName != null) out.append(" for $storeName")
        out.append(". ")
        result.leads.forEachIndexed { i, lead ->
            out.append("${i + 1}. ${lead.title}. ")
        }
        out.append(
            "These come from the web, and a code might not work at checkout — " +
                "I never make up codes, so if it doesn't work, the store just doesn't take it."
        )
        return out.toString()
    }

    private fun shortTitle(product: Product): String {
        val t = product.title.trim()
        return if (t.length > 60) t.take(57) + "…" else t
    }
}
