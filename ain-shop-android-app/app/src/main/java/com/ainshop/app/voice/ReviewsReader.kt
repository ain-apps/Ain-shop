package com.ainshop.app.voice

import com.ainshop.app.data.AinShopApi
import com.ainshop.app.data.Product
import com.ainshop.app.util.Money

// AIN Shop — read reviews aloud.
// "What do buyers say about this?"
//
// What the app can honestly say, and where it comes from:
//   1. The star rating and how many reviews — from the search listing
//      itself (real data the server already gave us).
//   2. The store page's own description and highlights — from
//      /api/shop/details, which reads the store's page just now.
//   3. What the web says about reviews for this product — a fresh web
//      search for "<product> reviews"; only the result titles are read,
//      labelled as "from the web".
// What it CANNOT do yet: read the full text of individual buyer reviews.
// The store pages hide their review text from automatic reading (the
// details endpoint returns no review text), so the app says so plainly
// instead of inventing buyer words: "I couldn't read the reviews for
// this one — the store page hides them." A server-side review reader
// is future work (see README.md). A review, a quote, or a star count
// is never made up.

data class ReviewsSummary(
    /** Spoken first: rating, review count, description, highlights. */
    val spoken: String,
    /** True when nothing at all could be read about reviews. */
    val nothingFound: Boolean,
)

class ReviewsReader(private val api: AinShopApi) {

    suspend fun read(product: Product, lang: String): ReviewsSummary {
        val parts = ArrayList<String>()
        var foundAnything = false

        // 1. Rating + review count, from the listing itself.
        if (product.rating != null) {
            val count = product.reviews?.let { " from $it reviews" } ?: ""
            parts.add("${product.rating} stars$count.")
            foundAnything = true
        } else if (product.reviews != null) {
            parts.add("${product.reviews} reviews, no star rating shown.")
            foundAnything = true
        }

        // 2. The store page's own description and highlights.
        when (val details = api.details(product.url, product.store, product.image)) {
            is AinShopApi.Result.Ok -> {
                val d = details.value
                if (!d.description.isNullOrBlank()) {
                    parts.add("The store says: ${d.description}")
                    foundAnything = true
                }
                d.highlights.take(2).forEach { parts.add(it) }
                if (d.rating != null && product.rating == null) {
                    parts.add("${d.rating} stars" + (d.reviews?.let { " from $it reviews" } ?: "") + ".")
                    foundAnything = true
                }
                if (!d.pageRead) {
                    parts.add("Note: this store does not allow its pages to be read automatically, so I only know the search listing.")
                }
            }
            is AinShopApi.Result.Err -> {
                // The page could not be read; keep what the listing gave us.
            }
        }

        // 3. What the web says about reviews for this product.
        val webNotes = searchWebForReviews(product, lang)
        if (webNotes.isNotEmpty()) {
            parts.add("From the web about reviews for this: " + webNotes.joinToString(" "))
            foundAnything = true
        }

        if (!foundAnything) {
            return ReviewsSummary(
                spoken = "I couldn't read the reviews for this one — the store page hides them. " +
                    "It has no star rating shown either.",
                nothingFound = true,
            )
        }
        val intro = "Here's what buyers say about ${shortName(product)}. "
        return ReviewsSummary(spoken = intro + parts.joinToString(" "), nothingFound = false)
    }

    private suspend fun searchWebForReviews(product: Product, lang: String): List<String> {
        val query = "${shortName(product)} reviews"
        val request = com.ainshop.app.data.SearchRequest(
            query = query, country = "US", currency = "USD",
        )
        return when (val result = api.search(request)) {
            is AinShopApi.Result.Ok -> {
                result.value.products
                    .filter { it.title.isNotBlank() }
                    .take(2)
                    .map { it.title }
            }
            is AinShopApi.Result.Err -> emptyList()
        }
    }

    private fun shortName(product: Product): String {
        val t = product.title.trim()
        return if (t.length > 80) t.take(77) + "…" else t
    }
}
