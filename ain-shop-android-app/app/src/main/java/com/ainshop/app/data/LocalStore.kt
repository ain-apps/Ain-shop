package com.ainshop.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

// AIN Shop — everything kept on this phone, and nothing else.
// No account, no sign-in, no server copy of lists, history, watchlist,
// favorites, feedback or teaching records. Location consent is asked once;
// only the ZIP/town is ever saved — never coordinates, never an address.
// "Delete my data" wipes all of it (clearAll).

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ainshop")

class LocalStore(private val context: Context) {
    private val gson = Gson()

    companion object {
        private val LANG = stringPreferencesKey("lang")
        private val SPEED = stringPreferencesKey("speed")
        private val ZIP = stringPreferencesKey("zip")
        private val CITY = stringPreferencesKey("city")
        private val REGION = stringPreferencesKey("region")
        private val COUNTRY = stringPreferencesKey("country")
        private val LOC_HOW = stringPreferencesKey("loc_how")
        private val LOC_CONSENT = stringPreferencesKey("loc_consent")
        private val FAVORITES = stringPreferencesKey("favorites")
        private val SHOPPING_LIST = stringPreferencesKey("shopping_list")
        private val WATCHLIST = stringPreferencesKey("watchlist")
        private val HISTORY = stringPreferencesKey("history")
        private val FEEDBACK = stringPreferencesKey("feedback")
        private val TEACHING = stringPreferencesKey("teaching")
        private val OPEN_STORES = stringPreferencesKey("open_stores")
        private val ACTIVE_STORE = stringPreferencesKey("active_store")
        private val PRICE_SIGHTINGS = stringPreferencesKey("price_sightings")
        private val LAST_SESSION = stringPreferencesKey("last_session")
        private val SHIRT_SIZE = stringPreferencesKey("size_shirt")
        private val PANTS_WAIST = stringPreferencesKey("size_pants_waist")
        private val PANTS_LENGTH = stringPreferencesKey("size_pants_length")
        private val SHOE_SIZE = stringPreferencesKey("size_shoe")
        private val STOCK_WATCHES = stringPreferencesKey("stock_watches")
        private val BARCODE_TEACHINGS = stringPreferencesKey("barcode_teachings")
        private val SHARE_MEMORY_ENABLED = booleanPreferencesKey("share_memory_enabled")
        private val AISLES_MINE = stringPreferencesKey("aisles_mine")
        private val OWNER_COOKIE = stringPreferencesKey("owner_cookie")
        private val ROUNDUP_ENABLED = booleanPreferencesKey("roundup_enabled")
        private val LAST_ROUNDUP = longPreferencesKey("last_roundup")
        private val WHISPER_MODEL = stringPreferencesKey("whisper_model")
        private val WHISPER_ASKED = booleanPreferencesKey("whisper_asked")

        const val MAX_FAVORITES = 10
        const val MAX_WATCHES = 20
        const val MAX_HISTORY = 100
        const val MAX_FEEDBACK = 200
        const val MAX_TEACHING = 100
        const val MAX_PRICE_SIGHTINGS = 500
    }

    // ---- settings ----

    val language: Flow<String> = context.dataStore.data.map { it[LANG] ?: "en" }
    val speed: Flow<ResponseSpeed> = context.dataStore.data.map {
        runCatching { ResponseSpeed.valueOf(it[SPEED] ?: "NORMAL") }.getOrDefault(ResponseSpeed.NORMAL)
    }
    val roundupEnabled: Flow<Boolean> = context.dataStore.data.map { it[ROUNDUP_ENABLED] ?: false }
    val lastRoundup: Flow<Long> = context.dataStore.data.map { it[LAST_ROUNDUP] ?: 0L }

    suspend fun setLanguage(code: String) = context.dataStore.edit { it[LANG] = code }
    suspend fun setSpeed(speed: ResponseSpeed) = context.dataStore.edit { it[SPEED] = speed.name }
    suspend fun setRoundupEnabled(enabled: Boolean) = context.dataStore.edit { it[ROUNDUP_ENABLED] = enabled }
    suspend fun setLastRoundup(at: Long) = context.dataStore.edit { it[LAST_ROUNDUP] = at }
    suspend fun setWhisperModel(path: String) = context.dataStore.edit { it[WHISPER_MODEL] = path }
    suspend fun setWhisperAsked() = context.dataStore.edit { it[WHISPER_ASKED] = true }
    val whisperModel: Flow<String?> = context.dataStore.data.map { it[WHISPER_MODEL] }
    val whisperAsked: Flow<Boolean> = context.dataStore.data.map { it[WHISPER_ASKED] ?: false }

    // ---- place (ZIP/town only) ----

    val place: Flow<SavedPlace?> = context.dataStore.data.map { prefs ->
        val zip = prefs[ZIP].orEmpty()
        val city = prefs[CITY].orEmpty()
        if (zip.isEmpty() && city.isEmpty()) null else SavedPlace(
            zip = zip, city = city, region = prefs[REGION].orEmpty(),
            country = prefs[COUNTRY] ?: "US", how = prefs[LOC_HOW] ?: "typed",
        )
    }
    val locationConsent: Flow<String?> = context.dataStore.data.map { it[LOC_CONSENT] }

    suspend fun savePlace(place: SavedPlace) = context.dataStore.edit {
        it[ZIP] = place.zip; it[CITY] = place.city; it[REGION] = place.region
        it[COUNTRY] = place.country; it[LOC_HOW] = place.how
    }

    suspend fun forgetPlace() = context.dataStore.edit {
        it.remove(ZIP); it.remove(CITY); it.remove(REGION); it.remove(COUNTRY); it.remove(LOC_HOW)
    }

    suspend fun setLocationConsent(consent: String) = context.dataStore.edit { it[LOC_CONSENT] = consent }

    // ---- generic JSON lists ----

    private inline fun <reified T> decode(json: String?): List<T> {
        if (json.isNullOrBlank()) return emptyList()
        return runCatching {
            gson.fromJson<List<T>>(json, object : TypeToken<List<T>>() {}.type)
        }.getOrDefault(emptyList())
    }

    private suspend fun <T> readList(key: Preferences.Key<String>): List<T> {
        val json = context.dataStore.data.first()[key]
        return decode(json)
    }

    private suspend fun writeList(key: Preferences.Key<String>, value: Any) {
        val json = gson.toJson(value)
        context.dataStore.edit { it[key] = json }
    }

    // ---- favorites (max 10, checked first) ----

    val favorites: Flow<List<String>> = context.dataStore.data.map { decode<String>(it[FAVORITES]) }

    suspend fun addFavorite(store: String): Boolean {
        val current = readList<String>(FAVORITES).toMutableList()
        if (current.any { it.equals(store, ignoreCase = true) }) return true
        if (current.size >= MAX_FAVORITES) return false
        current.add(store)
        writeList(FAVORITES, current)
        return true
    }

    suspend fun removeFavorite(store: String) {
        val current = readList<String>(FAVORITES).filterNot { it.equals(store, ignoreCase = true) }
        writeList(FAVORITES, current)
    }

    // ---- shopping list ----

    val shoppingList: Flow<List<ListItem>> = context.dataStore.data.map { decode<ListItem>(it[SHOPPING_LIST]) }

    suspend fun addToList(item: ListItem) {
        val current = readList<ListItem>(SHOPPING_LIST).toMutableList()
        val existing = current.indexOfFirst { it.url.isNotEmpty() && it.url == item.url }
        if (existing >= 0) {
            val old = current[existing]
            current[existing] = old.copy(qty = old.qty + item.qty)
        } else {
            current.add(0, item)
        }
        writeList(SHOPPING_LIST, current)
    }

    suspend fun removeFromList(urlOrTitle: String) {
        val current = readList<ListItem>(SHOPPING_LIST)
            .filterNot { it.url == urlOrTitle || it.title == urlOrTitle }
        writeList(SHOPPING_LIST, current)
    }

    suspend fun clearList() = writeList(SHOPPING_LIST, emptyList<ListItem>())

    // ---- watchlist (max 20) ----

    val watchlist: Flow<List<WatchItem>> = context.dataStore.data.map { decode<WatchItem>(it[WATCHLIST]) }

    suspend fun addWatch(item: WatchItem): Boolean {
        val current = readList<WatchItem>(WATCHLIST).toMutableList()
        if (current.any { it.url.isNotEmpty() && it.url == item.url }) return true
        if (current.size >= MAX_WATCHES) return false
        current.add(0, item)
        writeList(WATCHLIST, current)
        return true
    }

    suspend fun updateWatch(item: WatchItem) {
        val current = readList<WatchItem>(WATCHLIST).toMutableList()
        val i = current.indexOfFirst { it.url == item.url || (it.url.isEmpty() && it.title == item.title) }
        if (i >= 0) current[i] = item
        writeList(WATCHLIST, current)
    }

    suspend fun removeWatch(urlOrTitle: String) {
        val current = readList<WatchItem>(WATCHLIST)
            .filterNot { it.url == urlOrTitle || it.title == urlOrTitle }
        writeList(WATCHLIST, current)
    }

    // ---- Buy again history (max 100) ----

    val history: Flow<List<HistoryEntry>> = context.dataStore.data.map { decode<HistoryEntry>(it[HISTORY]) }

    suspend fun recordHistory(entry: HistoryEntry) {
        val current = readList<HistoryEntry>(HISTORY).toMutableList()
        current.removeAll { it.url.isNotEmpty() && it.url == entry.url }
        current.add(0, entry)
        writeList(HISTORY, current.take(MAX_HISTORY))
    }

    // ---- feedback (max 200, on this phone only) ----

    val feedback: Flow<List<FeedbackEvent>> = context.dataStore.data.map { decode<FeedbackEvent>(it[FEEDBACK]) }

    suspend fun recordFeedback(event: FeedbackEvent) {
        val current = readList<FeedbackEvent>(FEEDBACK).toMutableList()
        current.add(0, event)
        writeList(FEEDBACK, current.take(MAX_FEEDBACK))
    }

    /** Small ranking nudge for one product: at most ±0.05, and the caller
     *  must never let it reorder two items more than 0.10 apart. */
    suspend fun feedbackBoost(title: String, store: String): Double {
        val events = readList<FeedbackEvent>(FEEDBACK)
            .filter { it.title == title && it.store == store }
        var boost = 0.0
        events.forEach {
            boost += when (it.verdict) {
                "helpful" -> 0.02
                "not_helpful" -> -0.02
                "wrong" -> -0.05
                else -> 0.0
            }
        }
        return boost.coerceIn(-0.05, 0.05)
    }

    // ---- teaching records: reported mistakes, on this phone only ----

    val teaching: Flow<List<TeachingRecord>> = context.dataStore.data.map { decode<TeachingRecord>(it[TEACHING]) }

    suspend fun recordTeaching(record: TeachingRecord) {
        val current = readList<TeachingRecord>(TEACHING).toMutableList()
        current.add(0, record)
        writeList(TEACHING, current.take(MAX_TEACHING))
    }

    // ---- open stores (several stores at once, each keeps its own place) ----

    val openStores: Flow<List<OpenStore>> = context.dataStore.data.map { decode<OpenStore>(it[OPEN_STORES]) }
    val activeStore: Flow<String?> = context.dataStore.data.map { it[ACTIVE_STORE] }

    suspend fun setActiveStore(key: String?) = context.dataStore.edit {
        if (key == null) it.remove(ACTIVE_STORE) else it[ACTIVE_STORE] = key
    }

    suspend fun rememberStore(store: OpenStore) {
        val current = readList<OpenStore>(OPEN_STORES).toMutableList()
        val i = current.indexOfFirst { it.key == store.key }
        if (i >= 0) current[i] = store else current.add(0, store)
        writeList(OPEN_STORES, current.take(8))
    }

    suspend fun closeStore(key: String) {
        val current = readList<OpenStore>(OPEN_STORES).filterNot { it.key == key }
        writeList(OPEN_STORES, current)
        val active = context.dataStore.data.first()[ACTIVE_STORE]
        if (active == key) setActiveStore(null)
    }

    // ---- price history: only prices this phone has actually seen ----
    // Every search records what it saw. "Was this cheaper before?" is
    // answered ONLY from these sightings plus the watchlist — a price the
    // app has never seen is never guessed.

    val priceSightings: Flow<List<PriceSighting>> =
        context.dataStore.data.map { decode<PriceSighting>(it[PRICE_SIGHTINGS]) }

    suspend fun recordSightings(products: List<Product>) {
        val fresh = products
            .filter { it.price != null }
            .map {
                PriceSighting(
                    key = priceKey(it.url, it.title, it.store),
                    title = it.title, store = it.store,
                    price = it.price!!, currency = it.currency,
                )
            }
        if (fresh.isEmpty()) return
        val current = readList<PriceSighting>(PRICE_SIGHTINGS).toMutableList()
        current.addAll(0, fresh)
        writeList(PRICE_SIGHTINGS, current.take(MAX_PRICE_SIGHTINGS))
    }

    suspend fun priceHistoryFor(title: String, store: String, url: String): List<PriceSighting> {
        val key = priceKey(url, title, store)
        return readList<PriceSighting>(PRICE_SIGHTINGS).filter { it.key == key }
    }

    fun priceKey(url: String, title: String, store: String): String =
        if (url.isNotBlank()) "url:$url"
        else "title:${title.lowercase().trim()}|${store.lowercase().trim()}"

    // ---- clothing sizes: on this phone only, set by voice ----

    val sizes: Flow<MySizes> = context.dataStore.data.map {
        MySizes(
            shirt = it[SHIRT_SIZE] ?: "",
            pantsWaist = it[PANTS_WAIST] ?: "",
            pantsLength = it[PANTS_LENGTH] ?: "",
            shoe = it[SHOE_SIZE] ?: "",
        )
    }

    /** kind is "shirt" | "pantsWaist" | "pantsLength" | "shoe". */
    suspend fun setSize(kind: String, value: String) = context.dataStore.edit {
        when (kind) {
            "shirt" -> it[SHIRT_SIZE] = value
            "pantsWaist" -> it[PANTS_WAIST] = value
            "pantsLength" -> it[PANTS_LENGTH] = value
            "shoe" -> it[SHOE_SIZE] = value
        }
    }

    suspend fun clearSizes() = context.dataStore.edit {
        it.remove(SHIRT_SIZE); it.remove(PANTS_WAIST); it.remove(PANTS_LENGTH); it.remove(SHOE_SIZE)
    }

    // ---- back-in-stock watches: on this phone only ----

    val stockWatches: Flow<List<StockWatch>> =
        context.dataStore.data.map { decode<StockWatch>(it[STOCK_WATCHES]) }

    suspend fun addStockWatch(item: StockWatch): Boolean {
        val current = readList<StockWatch>(STOCK_WATCHES)
        if (current.any { it.url == item.url && item.url.isNotBlank() || it.title == item.title && it.store == item.store }) return false
        if (current.size >= MAX_WATCHES) return false
        writeList(STOCK_WATCHES, listOf(item) + current)
        return true
    }

    suspend fun removeStockWatch(urlOrTitle: String) {
        val current = readList<StockWatch>(STOCK_WATCHES)
        writeList(STOCK_WATCHES, current.filterNot { it.url == urlOrTitle || it.title == urlOrTitle })
    }

    // ---- taught barcodes: "this barcode is..." — on this phone only ----

    val barcodeTeachings: Flow<List<BarcodeTeaching>> =
        context.dataStore.data.map { decode<BarcodeTeaching>(it[BARCODE_TEACHINGS]) }

    suspend fun findBarcodeTeaching(code: String): BarcodeTeaching? {
        val digits = code.filter { it.isDigit() }
        return readList<BarcodeTeaching>(BARCODE_TEACHINGS)
            .firstOrNull { it.code.filter { c -> c.isDigit() } == digits }
    }

    suspend fun teachBarcode(code: String, name: String, brand: String = "") {
        val current = readList<BarcodeTeaching>(BARCODE_TEACHINGS)
            .filterNot { it.code.filter { c -> c.isDigit() } == code.filter { c -> c.isDigit() } }
        writeList(BARCODE_TEACHINGS, listOf(BarcodeTeaching(code, name, brand)) + current.take(199))
    }

    // ---- shared pure memory: the shopper's own choice ----
    // Item facts only, never personal. The toggle turns off ALL sharing
    // (web facts and user-taught facts alike); on-phone memory keeps
    // working either way.

    val shareMemoryEnabled: Flow<Boolean> =
        context.dataStore.data.map { it[SHARE_MEMORY_ENABLED] ?: true }

    suspend fun setShareMemoryEnabled(enabled: Boolean) =
        context.dataStore.edit { it[SHARE_MEMORY_ENABLED] = enabled }

    // ---- aisles I taught, on this phone only ----
    // Where an item sits inside a store, as this shopper taught it.
    // Shared only after a voice confirmation (see AppViewModel).

    val myAisles: Flow<List<MemoryAisle>> =
        context.dataStore.data.map { decode<MemoryAisle>(it[AISLES_MINE]) }

    suspend fun saveMyAisle(aisle: MemoryAisle) {
        val current = readList<MemoryAisle>(AISLES_MINE)
            .filterNot { it.store.equals(aisle.store, ignoreCase = true) }
        writeList(AISLES_MINE, listOf(aisle) + current.take(99))
    }

    suspend fun myAisleFor(store: String): MemoryAisle? =
        readList<MemoryAisle>(AISLES_MINE).firstOrNull { it.store.equals(store, ignoreCase = true) }

    // ---- owner session: the cookie only, never the PIN ----
    // POST /api/owner/login returns a 30-day session cookie (bain_owner).
    // Only that cookie is kept, in private storage. The PIN itself is
    // never stored anywhere on the phone.

    val ownerCookie: Flow<String?> = context.dataStore.data.map { it[OWNER_COOKIE] }

    suspend fun ownerCookieValue(): String? =
        context.dataStore.data.first()[OWNER_COOKIE]

    suspend fun saveOwnerCookie(cookie: String) =
        context.dataStore.edit { it[OWNER_COOKIE] = cookie }

    suspend fun clearOwnerCookie() = context.dataStore.edit { it.remove(OWNER_COOKIE) }

    // ---- last session: resume exactly where the shopper left off ----
    // Saved on every search and on pause (e.g. an incoming phone call),
    // restored on launch — same search, same results, nothing lost.

    suspend fun saveLastSession(json: String) =
        context.dataStore.edit { it[LAST_SESSION] = json }

    val lastSession: Flow<String?> = context.dataStore.data.map { it[LAST_SESSION] }

    suspend fun clearLastSession() = context.dataStore.edit { it.remove(LAST_SESSION) }

    // ---- delete everything on this phone ----

    suspend fun clearAll() {
        context.dataStore.edit { it.clear() }
    }
}
