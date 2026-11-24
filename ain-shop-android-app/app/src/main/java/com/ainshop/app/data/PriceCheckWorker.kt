package com.ainshop.app.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.ainshop.app.MainActivity
import com.ainshop.app.util.Money
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

// AIN Shop — background price-drop and back-in-stock checks.
// The voice alert happens when the shopper is using the app (the
// ViewModel's checkWatchlist speaks the drops). This worker is the
// other half: every six hours it quietly re-checks the watched items
// and the back-in-stock watches, and if something dropped or came back,
// it leaves ONE notification. Tapping it opens the app, which reads the
// news aloud. No notification means nothing changed. The worker runs
// only with network, never sends anything anywhere, and never invents
// a price — it uses the same fresh searches as the foreground check.

class PriceCheckWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    companion object {
        const val WORK_NAME = "ain-price-check"
        const val CHANNEL_ID = "ain_price_drops"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<PriceCheckWorker>(6, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request
            )
        }
    }

    override suspend fun doWork(): Result {
        val store = LocalStore(applicationContext)
        val watches = store.watchlist.firstOrNull().orEmpty()
        val stockWatches = store.stockWatches.firstOrNull().orEmpty()
        if (watches.isEmpty() && stockWatches.isEmpty()) return Result.success()

        val alerts = ArrayList<String>()
        for (watch in watches) {
            val request = SearchRequest(query = watch.query, currency = watch.currency, fresh = true)
            val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }
            if (result is AinShopApi.Result.Ok) {
                val cheapest = result.value.products.filter { it.price != null }.minByOrNull { it.price!! }
                if (cheapest != null) {
                    val low = cheapest.price!!
                    val dropped = (watch.targetPrice != null && low <= watch.targetPrice!!) ||
                        (watch.firstPrice != null && low < watch.firstPrice!!) ||
                        (watch.lastPrice != null && low < watch.lastPrice!!)
                    if (dropped) {
                        alerts.add("Price drop: ${watch.title} is now ${Money.speak(low, cheapest.currency)} at ${cheapest.store}.")
                    }
                    store.updateWatch(watch.copy(lastPrice = low, lastCheckedAt = System.currentTimeMillis()))
                }
            }
        }
        for (watch in stockWatches) {
            val request = SearchRequest(query = watch.query, currency = "USD", fresh = true)
            val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }
            if (result is AinShopApi.Result.Ok) {
                val match = result.value.products.firstOrNull { p ->
                    (watch.url.isNotBlank() && p.url == watch.url) ||
                        (p.title.equals(watch.title, ignoreCase = true) && p.store == watch.store)
                }
                if (match != null && match.inStock == true) {
                    alerts.add("${watch.title} is back in stock at ${match.store}.")
                    store.removeStockWatch(watch.url.ifEmpty { watch.title })
                }
            }
        }
        if (alerts.isNotEmpty()) {
            notify(alerts.joinToString(" "))
        }
        return Result.success()
    }

    private fun notify(text: String) {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID, "Price drops and back in stock",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = "AIN Shop tells you when a watched price drops or an item comes back." }
        manager.createNotificationChannel(channel)
        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pending = PendingIntent.getActivity(
            applicationContext, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("AIN Shop")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        manager.notify(1, notification)
    }
}
