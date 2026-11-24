package com.ainshop.app.data

import com.google.gson.annotations.SerializedName

// AIN Shop — owner usage numbers, from the same backend API the website
// uses: GET /api/owner/usage (behind the owner PIN — see OwnerApi).
//
// PRIVACY: counts only, never who. The server counts unique devices
// per day (one count per device per day), never a name, never what one
// person bought, never anyone's personal data. The app shows and speaks
// exactly those counts and nothing else.
//
// What the server returns TODAY (checked 2026-11-20 in site/_worker.js):
//   • visitors per day (new vs returning), 14 days + today/week/all-time
//   • platform counts (iPhone / Android / web) over 14 days
//   • searches per day, 7 days (from the server's daily search counter)
// What it does NOT count yet — the app says so plainly instead of
// inventing a number:
//   • barcode scans per day (the server rate-limits them but doesn't
//     return a count), most-searched items (searches are only counted,
//     never logged by query), most-tapped buy buttons (a tap opens the
//     store's page directly — no server round-trip to count), and a
//     language breakdown (the visits table stores a language, but the
//     stats response doesn't return it).
// The models below already read those fields when present
// (barcode_scans, most_searched, most_tapped_buy, by_lang), so the day
// the server starts counting them, the app shows them with no update.

/** One day of visitors: unique devices, new vs returning. */
data class OwnerByDay(
    val day: String = "",
    val devices: Int = 0,
    @SerializedName("new") val newDevices: Int = 0,
    val returning: Int = 0,
)

/** One day of usage: searches (and, when the server counts them,
 *  barcode scans and the most-searched / most-tapped lists). */
data class OwnerDay(
    val day: String = "",
    val searches: Int = 0,
    val sessions: Int = 0,
    val minutes: Double = 0.0,
    @SerializedName("spent_cents") val spentCents: Double = 0.0,
    @SerializedName("barcode_scans") val barcodeScans: Int? = null,
    @SerializedName("most_searched") val mostSearched: List<OwnerRankedItem> = emptyList(),
    @SerializedName("most_tapped_buy") val mostTappedBuy: List<OwnerRankedItem> = emptyList(),
)

/** One ranked item: a search term or a buy button, and how many times. */
data class OwnerRankedItem(
    val item: String = "",
    val count: Int = 0,
)

/** Visitor counts: today, week, all time, per day, by platform. */
data class VisitorStats(
    val today: Int = 0,
    @SerializedName("today_new") val todayNew: Int = 0,
    @SerializedName("today_returning") val todayReturning: Int = 0,
    val week: Int = 0,
    @SerializedName("all_time") val allTime: Int = 0,
    @SerializedName("by_day") val byDay: List<OwnerByDay> = emptyList(),
    @SerializedName("by_platform") val byPlatform: Map<String, Int> = emptyMap(),
    /** Language breakdown — not returned by the server yet. */
    @SerializedName("by_lang") val byLang: Map<String, String> = emptyMap(),
    @SerializedName("test_hits") val testHits: Int = 0,
    val note: String = "",
)

/** GET /api/owner/usage — the whole owner answer. */
data class OwnerUsageResponse(
    val days: List<OwnerDay> = emptyList(),
    val visitors: VisitorStats? = null,
)
