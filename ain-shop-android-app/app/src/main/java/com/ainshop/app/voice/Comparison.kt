package com.ainshop.app.voice

import com.ainshop.app.data.Product
import com.ainshop.app.util.Money

// AIN Shop — compare two results by voice.
// "Compare the first one and the second one" → the price, rating and key
// differences, spoken side by side. Everything here comes from the
// results already on screen; a fact that isn't shown is said as
// "not shown", never guessed.

object Comparison {

    data class ComparedPair(val first: Product, val second: Product)

    /** "the first one and the second one" / "compare these two" —
     *  returns the two indices, or null when the words name fewer than two. */
    fun pickIndices(text: String, results: List<Product>, currentIndex: Int = -1): Pair<Int, Int>? {
        val pair = pickPair(text, results, currentIndex) ?: return null
        val first = results.indexOf(pair.first)
        val second = results.indexOf(pair.second)
        return if (first >= 0 && second >= 0 && first != second) first to second else null
    }

    /** The two products named, or null when the words name fewer than two. */
    fun pickPair(text: String, results: List<Product>, currentIndex: Int = -1): ComparedPair? {
        if (results.size < 2) return null
        val t = VoiceCommands.fix(text)
        val indices = ArrayList<Int>()
        // "the first one and the second one", "number 1 and number 3" …
        Regex("number (\\d+)").findAll(t).forEach {
            val n = it.groupValues[1].toIntOrNull()?.minus(1)
            if (n != null && n in results.indices && n !in indices) indices.add(n)
        }
        val ordinals = mapOf(
            "first" to 0, "second" to 1, "third" to 2, "fourth" to 3, "fifth" to 4,
            "1st" to 0, "2nd" to 1, "3rd" to 2, "4th" to 3, "5th" to 4,
        )
        for ((word, index) in ordinals) {
            if (Regex("\\b$word\\b").containsMatchIn(t) && index in results.indices && index !in indices) {
                indices.add(index)
            }
        }
        if (indices.size < 2) {
            if (t.contains("these") || t.contains("both") || t.contains("them")) {
                indices.clear()
                indices.add(0)
                indices.add(1)
            } else if (indices.size == 1 && currentIndex in results.indices && currentIndex != indices[0]) {
                indices.add(currentIndex)
            }
        }
        if (indices.size < 2) return null
        return ComparedPair(results[indices[0]], results[indices[1]])
    }

    /** The spoken side-by-side comparison. Prices are read clearly, the
     *  cheaper one is named, and differences in rating, stock, store and
     *  delivery are said in plain words. */
    fun speak(pair: ComparedPair, firstLabel: String, secondLabel: String): String {
        val a = pair.first
        val b = pair.second
        val out = StringBuilder()
        out.append("Comparing $firstLabel and $secondLabel. ")
        // Price.
        val pa = a.price
        val pb = b.price
        if (pa != null && pb != null) {
            out.append("$firstLabel costs ${Money.speak(pa, a.currency)}. ")
            out.append("$secondLabel costs ${Money.speak(pb, b.currency)}. ")
            val diff = kotlin.math.abs(pa - pb)
            if (diff < 0.01) {
                out.append("They cost the same. ")
            } else if (pa < pb) {
                out.append("$firstLabel is cheaper by ${Money.speak(diff, a.currency)}. ")
            } else {
                out.append("$secondLabel is cheaper by ${Money.speak(diff, b.currency)}. ")
            }
        } else {
            out.append("Price: $firstLabel ${pa?.let { Money.speak(it, a.currency) } ?: "not shown"}. ")
            out.append("$secondLabel ${pb?.let { Money.speak(it, b.currency) } ?: "not shown"}. ")
        }
        // Rating.
        if (a.rating != null || b.rating != null) {
            val ra = a.rating?.let { "$it stars" + (a.reviews?.let { r -> " from $r reviews" } ?: "") } ?: "no rating shown"
            val rb = b.rating?.let { "$it stars" + (b.reviews?.let { r -> " from $r reviews" } ?: "") } ?: "no rating shown"
            out.append("$firstLabel: $ra. $secondLabel: $rb. ")
            if (a.rating != null && b.rating != null && a.rating != b.rating) {
                out.append(if (a.rating > b.rating) "$firstLabel is rated higher. " else "$secondLabel is rated higher. ")
            }
        }
        // Stock.
        val sa = when (a.inStock) { true -> "in stock"; false -> "out of stock"; null -> "stock not shown" }
        val sb = when (b.inStock) { true -> "in stock"; false -> "out of stock"; null -> "stock not shown" }
        if (sa != sb) out.append("$firstLabel is $sa, $secondLabel is $sb. ")
        // Store + delivery, in the store's own words.
        if (a.store != b.store) out.append("$firstLabel is at ${a.store}, $secondLabel is at ${b.store}. ")
        if (a.delivery != null || b.delivery != null) {
            if (a.delivery != null) out.append("$firstLabel delivery: ${a.delivery}. ")
            if (b.delivery != null) out.append("$secondLabel delivery: ${b.delivery}. ")
        }
        // Brand / colour, when they differ.
        if (a.brand != null && b.brand != null && a.brand != b.brand) {
            out.append("Brands differ: ${a.brand} and ${b.brand}. ")
        }
        if (a.color != null && b.color != null && a.color != b.color) {
            out.append("Colours differ: ${a.color} and ${b.color}. ")
        }
        return out.toString().trim()
    }
}
