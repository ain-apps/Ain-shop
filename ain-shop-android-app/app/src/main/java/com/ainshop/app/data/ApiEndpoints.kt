package com.ainshop.app.data

// GENERATED — DO NOT EDIT BY HAND.
// Generated from ain-shop-shared/config.json + api-contract.json by
// ain-shop-shared/tools/generate-android-api.mjs. To change an address
// or an endpoint, change the shared files and re-run the generator.
// Generated: 2026-11-22

/** One address and one endpoint list for the whole app, from the shared contract. */
object ApiEndpoints {
    const val BASE_URL = "https://ain-shop.natimedwed.workers.dev"
    const val AI_INTENT = "/api/ai/intent"
    const val SHOP_SEARCH = "/api/shop/search"
    const val SHOP_STORE = "/api/shop/store"
    const val SHOP_DETAILS = "/api/shop/details"
    const val SHOP_IDENTIFY = "/api/shop/identify"
    const val SHOP_BARCODE = "/api/shop/barcode"
    const val SHOP_NEARBY = "/api/shop/nearby"
    const val OWNER_LOGIN = "/api/owner/login"
    const val OWNER_LOGOUT = "/api/owner/logout"
    const val OWNER_USAGE = "/api/owner/usage"
    const val MEMORY_LOOKUP = "/api/memory/lookup" // DRIFT: server does not have this path yet (see api-contract.json)
    const val MEMORY_TEACH = "/api/memory/teach" // DRIFT: server does not have this path yet (see api-contract.json)
}
