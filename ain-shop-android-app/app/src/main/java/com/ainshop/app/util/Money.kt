package com.ainshop.app.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

// AIN Shop — money, spoken clearly and shown clearly.
// Spoken prices are always words ("twelve dollars and forty-nine
// cents"), never a bare number a voice can mumble. A price that isn't
// shown is said as "price not shown", never guessed.

object Money {

    private val SPOKEN_UNIT = mapOf(
        "USD" to "dollars", "GBP" to "pounds", "EUR" to "euros",
        "ILS" to "shekels", "CAD" to "Canadian dollars", "AUD" to "Australian dollars",
        "JPY" to "yen", "INR" to "rupees", "MXN" to "Mexican pesos",
        "BRL" to "Brazilian reais", "NZD" to "New Zealand dollars",
    )

    /** "12.49 USD" → "twelve dollars and forty-nine cents" is too wordy
     *  for a list, so spoken prices use digits in words: "12 dollars and
     *  49 cents". Whole dollars read as "12 dollars". */
    fun speak(amount: Double?, currency: String = "USD"): String {
        if (amount == null) return "price not shown"
        val unit = SPOKEN_UNIT[currency.uppercase()] ?: currency.uppercase()
        val dollars = amount.toLong()
        val cents = ((amount - dollars) * 100 + 0.5).toInt()
        return if (cents == 0) "$dollars $unit"
        else "$dollars $unit and $cents cents"
    }

    fun format(amount: Double?, currency: String = "USD"): String {
        if (amount == null) return "—"
        return try {
            val fmt = NumberFormat.getCurrencyInstance(Locale.US)
            fmt.currency = Currency.getInstance(currency.uppercase())
            fmt.format(amount)
        } catch (e: Exception) {
            "$${"%.2f".format(amount)}"
        }
    }
}
