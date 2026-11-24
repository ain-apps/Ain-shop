package com.ainshop.app.voice

import com.ainshop.app.data.AinShopApi
import com.ainshop.app.data.NearbyStore
import com.ainshop.app.data.SavedPlace
import com.ainshop.app.data.SearchRequest
import com.ainshop.app.data.StoreDirectory

// AIN Shop — "Tell me about the store."
// "Tell me about Walmart" → where the nearest one is, how many locations
// it has, its hours, its phone number, whether it delivers, and whether
// it is online-only. Every piece of it is spoken aloud, not just shown.
//
// Where each fact comes from — and only from there:
//   • Phone number: the app's own store directory (StoreDirectory),
//     numbers verified against public sources on 2026-11-20.
//   • Nearest location, hours, pickup, same-day delivery: a live lookup
//     at /api/shop/nearby using the saved place. The server returns
//     hours only as the store page says them; empty means the page does
//     not say. Never guessed.
//   • How many locations: a live web search for "<store> how many
//     locations", read back verbatim and labelled "from the web just
//     now". Counts change, so they are never stored as a fixed fact.
//   • Online-only: only the stores that truly have no walk-in stores of
//     their own — Amazon, eBay, Etsy, Chewy. An online-only store is
//     never given a street address, and the app says so plainly.
// Anything unknown is said as unknown: "I don't know the hours for
// this one." An address, hours, phone number or location count is
// never invented.

data class StoreInfo(
    val name: String,
    /** True only for stores with no walk-in stores of their own. */
    val onlineOnly: Boolean,
    /** Public customer-service number from the app's directory, or null. */
    val phone: String?,
    /** Nearest location from the live nearby lookup, or null. */
    val nearest: NearbyStore?,
    /** The place the nearest lookup was searched near (ZIP or town). */
    val nearestPlace: String?,
    /** True when the nearby lookup was run but found no such store. */
    val nearestNotFound: Boolean,
    /** Verbatim line from a live web lookup, or null when unknown. */
    val locationCount: String?,
    /** Whether the store delivers: true / false / null (unknown). */
    val delivers: Boolean?,
    /** Whether the store offers pickup: true / false / null (unknown). */
    val offersPickup: Boolean?,
)

class StoreInfoProvider(private val api: AinShopApi) {

    companion object {
        /** Stores with no walk-in stores of their own. Wayfair is NOT in
         *  this list: it is mostly online but has opened physical stores,
         *  so its nearest lookup decides instead of a fixed claim. */
        val ONLINE_ONLY = setOf("amazon", "ebay", "etsy", "chewy")
    }

    suspend fun tellMeAbout(name: String, savedPlace: SavedPlace?): StoreInfo {
        val contact = StoreDirectory.byName(name)
        val displayName = contact?.name ?: name.trim().replaceFirstChar { it.uppercaseChar() }
        val onlineOnly = ONLINE_ONLY.contains(
            (contact?.host?.substringBefore('.') ?: name).lowercase().replace(Regex("[^a-z]"), "")
        )

        var nearest: NearbyStore? = null
        var nearestNotFound = false
        var nearestPlace: String? = null
        if (!onlineOnly && savedPlace != null) {
            nearestPlace = savedPlace.zip.ifEmpty { savedPlace.city }
            when (val result = api.nearby(
                zip = savedPlace.zip, city = savedPlace.city,
                region = savedPlace.region, country = savedPlace.country,
                kind = displayName,
            )) {
                is AinShopApi.Result.Ok -> {
                    nearest = result.value.stores.firstOrNull { store ->
                        store.name.lowercase().contains(displayName.lowercase()) ||
                            displayName.lowercase().contains(store.name.lowercase().split(" ").firstOrNull().orEmpty())
                    }
                    nearestNotFound = nearest == null
                }
                is AinShopApi.Result.Err -> nearestNotFound = false
            }
        }

        // How many locations: a live web lookup, read back verbatim.
        val locationCount = if (onlineOnly) null else lookupLocationCount(displayName)

        val delivers = when {
            onlineOnly -> true
            nearest?.sameDayDelivery != null -> nearest.sameDayDelivery
            else -> null
        }
        val offersPickup = nearest?.pickup

        return StoreInfo(
            name = displayName,
            onlineOnly = onlineOnly,
            phone = contact?.phone,
            nearest = nearest,
            nearestPlace = nearestPlace,
            nearestNotFound = nearestNotFound,
            locationCount = locationCount,
            delivers = delivers,
            offersPickup = offersPickup,
        )
    }

    private suspend fun lookupLocationCount(storeName: String): String? {
        val request = SearchRequest(query = "$storeName how many locations", country = "US", currency = "USD")
        return when (val result = api.search(request)) {
            is AinShopApi.Result.Ok -> {
                result.value.products
                    .firstOrNull { it.title.isNotBlank() }
                    ?.title
                    ?.takeIf { it.length in 10..180 }
            }
            is AinShopApi.Result.Err -> null
        }
    }

    /** The full spoken answer. Every unknown piece is said as unknown. */
    fun speak(info: StoreInfo, savedPlace: SavedPlace?): String {
        val out = StringBuilder()
        out.append("Here's what I know about ${info.name}. ")
        if (info.onlineOnly) {
            out.append(
                "${info.name} is online only — it has no walk-in store, " +
                    "so there is no street address. It delivers to your door. "
            )
        } else {
            // Nearest location.
            when {
                info.nearest != null -> {
                    val n = info.nearest
                    out.append("The nearest one")
                    if (!info.nearestPlace.isNullOrBlank()) out.append(" near ${info.nearestPlace}")
                    if (!n.address.isNullOrBlank()) out.append(" is at ${n.address}") else out.append(" was found, but I don't have its street address")
                    out.append(". ")
                    if (!n.hoursToday.isNullOrBlank()) out.append("Today's hours: ${n.hoursToday}. ")
                    else out.append("I don't know the hours for this one. ")
                }
                info.nearestNotFound -> {
                    out.append("I couldn't find a ${info.name} near ${info.nearestPlace ?: "your saved place"} just now. ")
                    out.append("I don't know the hours for this one. ")
                }
                savedPlace == null -> {
                    out.append(
                        "I don't have a place saved, so I can't find the nearest one. " +
                            "Save your place first, then ask again. " +
                            "I don't know the hours for this one. "
                    )
                }
                else -> {
                    out.append("I couldn't look up the nearest one just now. ")
                    out.append("I don't know the hours for this one. ")
                }
            }
            // Delivery + pickup.
            when (info.delivers) {
                true -> out.append("It does deliver. ")
                false -> out.append("It does not offer same-day delivery. ")
                null -> out.append("I don't know whether it delivers. ")
            }
            when (info.offersPickup) {
                true -> out.append("You can pick up there. ")
                false -> out.append("Pickup is not offered there. ")
                null -> Unit // Not said when unknown — the delivery line already covers it.
            }
            // Location count.
            if (info.locationCount != null) {
                out.append("From the web just now: ${info.locationCount}. ")
            } else {
                out.append("I don't know how many locations it has. ")
            }
        }
        // Phone number.
        if (info.phone != null) {
            out.append("Its public customer-service number is ${readablePhone(info.phone)}. ")
        } else {
            out.append("I don't have a public phone number for this store. ")
        }
        return out.toString().trim()
    }

    /** "1-800-925-6278" → "1 800 925 6278", so TTS reads it digit by digit. */
    private fun readablePhone(phone: String): String =
        phone.replace(Regex("[^0-9]"), " ").replace(Regex("\\s+"), " ").trim()
}
