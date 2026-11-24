package com.ainshop.app.data

import com.google.gson.annotations.SerializedName

// AIN Shop — data models.
// These mirror the server's answers at https://ain-shop.natimedwed.workers.dev
// (see the website reference in ../ain-shop-android-test/site/_worker.js).
// The app never calls OpenAI or any AI service directly; the server holds
// the keys and the app only ever sends query text.

// ---- search ----

data class SearchRequest(
    val query: String,
    val stores: List<String> = emptyList(),
    @SerializedName("min_price") val minPrice: Double? = null,
    @SerializedName("max_price") val maxPrice: Double? = null,
    val near: String = "",
    @SerializedName("near_me") val nearMe: Boolean = false,
    val country: String = "US",
    val currency: String = "USD",
    /** "delivery" or "pickup" — fastest delivery / pickup near me. */
    val fast: String? = null,
    /** true = skip the server cache entirely (price-drop checks, deals). */
    val fresh: Boolean = false,
    val zip: String = "",
    val loc: LocPayload? = null,
)

data class LocPayload(
    val city: String = "",
    val region: String = "",
    val country: String = "US",
)

data class Product(
    val title: String = "",
    val price: Double? = null,
    val currency: String = "USD",
    val store: String = "",
    val url: String = "",
    val image: String? = null,
    val rating: Double? = null,
    val reviews: Int? = null,
    @SerializedName("in_stock") val inStock: Boolean? = null,
    val brand: String? = null,
    val color: String? = null,
    /** Delivery time in the store page's own words — never guessed. */
    val delivery: String? = null,
    /** "store_page" | "store_api" | "search" */
    @SerializedName("price_source") val priceSource: String? = null,
    @SerializedName("checked_at") val checkedAt: Long? = null,
    /** Higher old price, when the page says one — this is what makes a deal. */
    @SerializedName("was_price") val wasPrice: Double? = null,
    val local: String? = null,
)

data class SearchResponse(
    val query: SearchRequest? = null,
    val products: List<Product> = emptyList(),
    /** The server's true count of good matches (before the top-3 cut). */
    val total: Int = 0,
    /** true = first answer came back early; the rest are still being checked. */
    val partial: Boolean = false,
    @SerializedName("searched_at") val searchedAt: Long = 0,
    val source: String? = null,
    val error: String? = null,
)

/** A store's own site, read by the server ("open Walmart"). */
data class StoreResponse(
    val store: String = "",
    val url: String = "",
    val partner: Boolean = false,
    val readable: Boolean = false,
    val products: List<Product> = emptyList(),
    val total: Int = 0,
    @SerializedName("on_sale") val onSale: List<Product> = emptyList(),
    val note: String = "",
    val error: String? = null,
)

/** What a product looks like, from its photo description — plus everything
 *  the server could read from the store's own page just now.
 *  NOTE: there is no review TEXT here. The server returns a star rating
 *  and a review count, plus the page's description and highlights. Full
 *  buyer words need a server-side review reader (see README.md); the app
 *  never invents review text. `page_read` is false when the store does
 *  not allow its pages to be read automatically. */
data class DetailsResponse(
    val url: String = "",
    val store: String = "",
    @SerializedName("page_read") val pageRead: Boolean = false,
    @SerializedName("page_note") val pageNote: String? = null,
    val title: String? = null,
    val price: Double? = null,
    @SerializedName("was_price") val wasPrice: Double? = null,
    val currency: String? = null,
    @SerializedName("checked_at") val checkedAt: Long? = null,
    val rating: Double? = null,
    val reviews: Int? = null,
    val brand: String? = null,
    val color: String? = null,
    @SerializedName("in_stock") val inStock: Boolean? = null,
    val seller: String? = null,
    val description: String? = null,
    val specs: List<String> = emptyList(),
    val highlights: List<String> = emptyList(),
    val looks: String? = null,
    val image: String? = null,
    val error: String? = null,
)

/** One price the app itself has seen, on this phone only.
 *  Recorded every time a search brings a product back, and from the
 *  watchlist's first/last prices. This is the ONLY price history the
 *  app may ever quote — it never guesses a past price. */
data class PriceSighting(
    val key: String,
    val title: String,
    val store: String,
    val price: Double,
    val currency: String = "USD",
    val at: Long = System.currentTimeMillis(),
)

/** The shopper's clothing sizes, on this phone only, set by voice.
 *  Men's clothing first (shirt, pants, shoes). A size is never guessed:
 *  if a size isn't saved, the app asks instead of searching in the
 *  wrong size. */
data class MySizes(
    val shirt: String = "",
    val pantsWaist: String = "",
    val pantsLength: String = "",
    val shoe: String = "",
) {
    fun isEmpty(): Boolean = shirt.isBlank() && pantsWaist.isBlank() && shoe.isBlank()
}

/** Something that was out of stock when the shopper looked at it, and
 *  they asked to be told when it comes back. Checked with the same
 *  fresh searches as the price watchlist. */
data class StockWatch(
    val title: String,
    val query: String,
    val store: String = "",
    val url: String = "",
    val lastPrice: Double? = null,
    val currency: String = "USD",
    val addedAt: Long = System.currentTimeMillis(),
)

/** A barcode the shopper taught the app ("this barcode is..."), on this
 *  phone only. Checked BEFORE any network lookup, so a taught barcode
 *  is answered at once and never re-asked. */
data class BarcodeTeaching(
    val code: String,
    val name: String,
    val brand: String = "",
    val at: Long = System.currentTimeMillis(),
)

// ---- barcode ----

data class BarcodeProduct(
    val name: String? = null,
    val title: String? = null,
    val brand: String? = null,
    val image: String? = null,
    val source: String? = null,
    /** Food / beauty / pet facts from the open databases (Open Food Facts
     *  family): these are what shared memory keeps for food — allergens
     *  and ingredients are item facts, never personal. */
    val quantity: String? = null,
    val category: String? = null,
    val ingredients: String? = null,
    val allergens: List<String> = emptyList(),
    val traces: List<String> = emptyList(),
    val labels: List<String> = emptyList(),
    @SerializedName("serving_size") val servingSize: String? = null,
)

data class BarcodeResponse(
    val found: Boolean = false,
    val code: String = "",
    val gtin: String = "",
    val product: BarcodeProduct? = null,
    @SerializedName("search_query") val searchQuery: String = "",
    val note: String = "",
    @SerializedName("sources_tried") val sourcesTried: List<String> = emptyList(),
    val error: String? = null,
)

// ---- camera: "what is this?" ----

data class IdentifyResponse(
    val identified: Boolean = false,
    @SerializedName("barcode_ok") val barcodeOk: Boolean = false,
    val description: String = "",
    val brand: String = "",
    val product: String = "",
    @SerializedName("model_or_size") val modelOrSize: String = "",
    val color: String = "",
    val barcode: String = "",
    @SerializedName("search_query") val searchQuery: String = "",
    val confidence: String = "low",
    val tip: String = "",
    val error: String? = null,
    val note: String? = null,
)

// ---- stores near you ----

/** Stores near a place, as the server returns them (see site/_worker.js
 *  parseNearby). Hours, pickup and same-day delivery come only as the store
 *  pages say them — null / empty means the page does not say, never a
 *  guess. `place` is the ZIP or town that was searched near. */
data class NearbyStore(
    val name: String = "",
    val address: String? = null,
    @SerializedName("hours_today") val hoursToday: String? = null,
    val pickup: Boolean? = null,
    @SerializedName("same_day_delivery") val sameDayDelivery: Boolean? = null,
    val url: String? = null,
)

data class NearbyResponse(
    val place: String? = null,
    val stores: List<NearbyStore> = emptyList(),
    @SerializedName("searched_at") val searchedAt: Long? = null,
    val note: String? = null,
    val error: String? = null,
)

// ---- natural-language commands the local parser doesn't know ----

data class IntentResponse(
    val command: String? = null,
    val query: String? = null,
    val answer: String? = null,
    val error: String? = null,
)

// ---- on this phone only (never sent anywhere) ----

data class ListItem(
    val title: String,
    val price: Double? = null,
    val currency: String = "USD",
    val store: String = "",
    val url: String = "",
    val image: String? = null,
    val qty: Int = 1,
    val addedAt: Long = System.currentTimeMillis(),
)

data class WatchItem(
    val title: String,
    val query: String,
    val store: String = "",
    val url: String = "",
    val firstPrice: Double? = null,
    val currency: String = "USD",
    val targetPrice: Double? = null,
    val lastPrice: Double? = null,
    val lastCheckedAt: Long = 0,
    val addedAt: Long = System.currentTimeMillis(),
)

data class HistoryEntry(
    val title: String,
    val price: Double? = null,
    val currency: String = "USD",
    val store: String = "",
    val url: String = "",
    val image: String? = null,
    val at: Long = System.currentTimeMillis(),
)

/** "That was helpful / not helpful" — kept on this phone only, max 200.
 *  Used only as a tiny ranking nudge (never more than ±0.05, and never
 *  enough to reorder two items whose relevance is more than 0.10 apart). */
data class FeedbackEvent(
    val title: String,
    val store: String,
    val url: String,
    val query: String,
    /** "helpful" | "not_helpful" | "wrong" */
    val verdict: String,
    val at: Long = System.currentTimeMillis(),
)

/** A reported mistake — a teaching record, on this phone only.
 *  Nothing is sent anywhere. A person reviews it before any fix is made.
 *  The slippers rule is NOT in here: it was proposed but is still waiting
 *  for his yes/no, so no record may ever become that rule. */
data class TeachingRecord(
    val query: String,
    val wrongTitle: String,
    val wrongStore: String = "",
    val whatWasWrong: String = "",
    val status: String = "pending-review",
    val at: Long = System.currentTimeMillis(),
)

/** The saved place: ZIP/town only — never coordinates, never an address. */
data class SavedPlace(
    val zip: String = "",
    val city: String = "",
    val region: String = "",
    val country: String = "US",
    /** "phone" | "typed" | "approx" */
    val how: String = "typed",
    val at: Long = System.currentTimeMillis(),
)

data class OpenStore(
    val key: String,
    val name: String,
    val site: String = "",
    val lastQuery: String = "",
    val at: Long = System.currentTimeMillis(),
)

enum class ResponseSpeed(val rate: Float) {
    FAST(1.15f), NORMAL(1.0f), SLOW(0.85f)
}
