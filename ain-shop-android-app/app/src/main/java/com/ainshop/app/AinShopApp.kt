package com.ainshop.app

import android.app.Application
import com.ainshop.app.data.PriceCheckWorker

// AIN Shop — the application. Starts the background price-drop checks
// (every six hours, network only; see PriceCheckWorker). Nothing else
// runs at startup: no account, no sign-in, no tracking.

class AinShopApp : Application() {
    override fun onCreate() {
        super.onCreate()
        PriceCheckWorker.schedule(this)
    }
}
