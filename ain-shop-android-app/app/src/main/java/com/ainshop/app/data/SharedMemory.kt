package com.ainshop.app.data

import com.google.gson.annotations.SerializedName

// AIN Shop — SHARED PURE MEMORY: one entry per item, holding everything
// known about it.
//
// What an entry holds (item facts ONLY):
//   name, brand, barcode, quantity, category, what a photo of it showed,
//   price + price history, where to buy it, which aisle/shelf it sits on
//   in a store, a reviews summary, and allergens/ingredients for food.
// What it NEVER holds: anything personal. No sizes, no shopping lists,
// no purchase history, no person's location, no names — of the shopper
// or of anyone else. There is no "taught by" field on purpose.
//
// Where the facts come from, and what leaves the phone:
//   • Public web facts (a live search result, an open product database):
//     remembered automatically after the search — that is how the next
//     person gets the answer instantly. These are public facts, not
//     personal ones.
//   • Photo facts (what a photo showed): remembered automatically too —
//     the photo itself is NEVER sent or stored, only the facts the photo
//     revealed (description, brand, product, colour).
//   • User-taught facts (an aisle/shelf, "this barcode is…", a
//     correction): shared ONLY after that user confirms it by voice.
//     Until then they stay on that phone only.
// A brand-new item falls back to the normal live search, then gets
// remembered. If nobody has taught an aisle, the app says so — an
// aisle is never guessed or invented.
//
// SERVER SIDE: the backend does not have these endpoints yet
// (checked 2026-11-20 — no /api/memory/* route in site/_worker.js).
// The client below calls them and treats a 404 as "no shared memory
// yet": the app keeps working with live search exactly as before.
// The exact contract is in README.md ("Shared pure memory") so the
// server side can be added to match it.

/** One price the app has actually seen for this item. */
data class MemoryPricePoint(
    val price: Double,
    val currency: String = "USD",
    val store: String = "",
    /** Epoch millis when this price was seen. */
    val at: Long = System.currentTimeMillis(),
)

/** Where to buy it: one store's offer. */
data class MemoryOffer(
    val store: String,
    val price: Double? = null,
    val currency: String = "USD",
    val url: String = "",
    val inStock: Boolean? = null,
)

/** Where it sits inside a store — user-taught only, never guessed. */
data class MemoryAisle(
    val store: String,
    val aisle: String,
    val shelf: String = "",
)

/** One shared memory entry: everything known about ONE item. */
data class SharedMemoryEntry(
    /** Lookup key: the barcode digits when known, else the normalised
     *  item name ("mens nike running shoes"). */
    val key: String,
    val name: String,
    val brand: String = "",
    val barcode: String = "",
    val quantity: String = "",
    val category: String = "",
    /** What a photo of it showed, in plain words (the photo itself is
     *  never stored or shared). */
    @SerializedName("photo_facts") val photoFacts: String = "",
    val offers: List<MemoryOffer> = emptyList(),
    @SerializedName("price_history") val priceHistory: List<MemoryPricePoint> = emptyList(),
    val aisles: List<MemoryAisle> = emptyList(),
    @SerializedName("reviews_summary") val reviewsSummary: String = "",
    val rating: Double? = null,
    val reviews: Int? = null,
    val allergens: List<String> = emptyList(),
    val traces: List<String> = emptyList(),
    val ingredients: String = "",
    /** "web" | "photo" | "user" — where the newest facts came from. */
    val origin: String = "web",
    @SerializedName("updated_at") val updatedAt: Long = System.currentTimeMillis(),
) {
    companion object

    /** The best (latest) price the memory knows, or null. */
    fun latestPrice(): MemoryPricePoint? = priceHistory.maxByOrNull { it.at }

    /** The cheapest price ever seen, or null. */
    fun lowestPrice(): MemoryPricePoint? = priceHistory.minByOrNull { it.price }
}

/** Build an entry from a live search result (public web facts). */
fun SharedMemoryEntry.Companion.fromProduct(p: Product, query: String): SharedMemoryEntry {
    val key = if (p.url.isNotBlank()) "url:${p.url}" else "name:${query.lowercase().trim()}"
    val offer = MemoryOffer(store = p.store, price = p.price, currency = p.currency, url = p.url, inStock = p.inStock)
    val history = p.price?.let {
        listOf(MemoryPricePoint(price = it, currency = p.currency, store = p.store))
    }.orEmpty()
    return SharedMemoryEntry(
        key = key, name = p.title, brand = p.brand ?: "", barcode = "",
        offers = listOf(offer), priceHistory = history,
        rating = p.rating, reviews = p.reviews, origin = "web",
    )
}

/** Build an entry from a barcode lookup (open product databases). */
fun SharedMemoryEntry.Companion.fromBarcode(b: BarcodeResponse): SharedMemoryEntry? {
    val product = b.product ?: return null
    val name = product.name ?: product.title ?: return null
    val key = if (b.code.isNotBlank()) "barcode:${b.code.filter { it.isDigit() }}" else "name:${name.lowercase().trim()}"
    return SharedMemoryEntry(
        key = key, name = name, brand = product.brand ?: "",
        barcode = b.code.filter { it.isDigit() },
        quantity = product.quantity ?: "", category = product.category ?: "",
        allergens = product.allergens, traces = product.traces,
        ingredients = product.ingredients ?: "", origin = "web",
    )
}

/** Build an entry from what a photo showed (facts only, never the photo). */
fun SharedMemoryEntry.Companion.fromPhoto(r: IdentifyResponse): SharedMemoryEntry? {
    if (!r.identified || r.searchQuery.isBlank()) return null
    val name = listOf(r.brand, r.product, r.modelOrSize).filter { it.isNotBlank() }.joinToString(" ")
    if (name.isBlank()) return null
    val key = if (r.barcode.isNotBlank()) "barcode:${r.barcode.filter { it.isDigit() }}"
    else "name:${r.searchQuery.lowercase().trim()}"
    return SharedMemoryEntry(
        key = key, name = name, brand = r.brand, barcode = r.barcode.filter { it.isDigit() },
        photoFacts = r.description, origin = "photo",
    )
}

/** Merge a new observation into an existing entry: prices accumulate,
 *  offers union by store, facts only ever fill gaps or get newer. */
fun SharedMemoryEntry.merge(other: SharedMemoryEntry): SharedMemoryEntry {
    val offers = (offers + other.offers)
        .groupBy { it.store.lowercase() }
        .map { (_, same) -> same.maxByOrNull { it.price ?: Double.MAX_VALUE } ?: same.first() }
    val history = (priceHistory + other.priceHistory)
        .sortedBy { it.at }
        .takeLast(20)
    val aisles = (aisles + other.aisles).distinctBy { it.store.lowercase() + "|" + it.aisle + "|" + it.shelf }
    return copy(
        name = if (name.isNotBlank()) name else other.name,
        brand = if (brand.isNotBlank()) brand else other.brand,
        barcode = if (barcode.isNotBlank()) barcode else other.barcode,
        quantity = if (quantity.isNotBlank()) quantity else other.quantity,
        category = if (category.isNotBlank()) category else other.category,
        photoFacts = if (photoFacts.isNotBlank()) photoFacts else other.photoFacts,
        offers = offers, priceHistory = history, aisles = aisles,
        reviewsSummary = if (reviewsSummary.isNotBlank()) reviewsSummary else other.reviewsSummary,
        rating = rating ?: other.rating,
        reviews = reviews ?: other.reviews,
        allergens = (allergens + other.allergens).distinct(),
        traces = (traces + other.traces).distinct(),
        ingredients = if (ingredients.isNotBlank()) ingredients else other.ingredients,
        origin = other.origin,
        updatedAt = System.currentTimeMillis(),
    )
}
