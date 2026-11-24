package com.ainshop.app.ui

import android.annotation.SuppressLint
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ainshop.app.data.*
import com.ainshop.app.util.Money
import com.ainshop.app.voice.*
import com.google.gson.Gson
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

// AIN Shop — the app's brain. One ViewModel owns the whole conversation:
// what is on screen, what is being said, what was heard, and what happens
// next. Every screen reads this state; every voice command lands here.
//
// The rules that matter, all in one place:
//   • Search is whole-web, top 3 + total count, more by voice ("next").
//   • First spoken answer within 15 seconds; repeats use a SHORT cache
//     of about 5 minutes, then go live again.
//   • The fixed matching (category gate, synonyms, wrong items removed)
//     and the bicycle accessory rule live in the server; the app gets
//     them by calling the same backend. The slippers rule is NOT
//     applied anywhere — it is still waiting for his yes/no.
//   • Buying, paying and deleting are confirmed by voice first.
//   • Nothing secret lives here: no keys, no tokens. The server holds
//     the key; the app sends query text only.
//   • A phone call pauses the voice and resumes exactly where it left
//     off; the session is also saved to the phone, so even if Android
//     kills the app mid-call, coming back restores the same search.

enum class AppScreen { HOME, RESULTS, BARCODE, IDENTIFY, LISTS, STORES, SETTINGS, OWNER }

sealed class UiEvent {
    data class OpenBrowser(val url: String) : UiEvent()
    /** Opens the phone's dialer with the number shown — never auto-dials. */
    data class Dial(val number: String) : UiEvent()
    object EnterPip : UiEvent()
    object ExitPip : UiEvent()
    /** Ask MainActivity for the location permission (from Settings). */
    object RequestLocationPermission : UiEvent()
    data class ShareText(val text: String) : UiEvent()
}

data class UiState(
    val screen: AppScreen = AppScreen.HOME,
    val language: String = "en",
    val speed: ResponseSpeed = ResponseSpeed.NORMAL,
    val statusText: String = "",
    val isSpeaking: Boolean = false,
    val isListening: Boolean = false,
    val handsFree: Boolean = false,
    val inPip: Boolean = false,
    val inCall: Boolean = false,
    val query: String = "",
    val results: List<Product> = emptyList(),
    val totalResults: Int = 0,
    val partial: Boolean = false,
    val shownCount: Int = 0,
    val currentIndex: Int = -1,
    val place: SavedPlace? = null,
    val favorites: List<String> = emptyList(),
    val shoppingList: List<ListItem> = emptyList(),
    val watchlist: List<WatchItem> = emptyList(),
    val history: List<HistoryEntry> = emptyList(),
    val openStores: List<OpenStore> = emptyList(),
    val activeStore: String? = null,
    val roundupEnabled: Boolean = false,
    val nearbyStores: List<NearbyStore> = emptyList(),
    val nearbyPlace: String? = null,
    val lastSpoken: String = "",
    val pendingQuestion: String? = null,
    val whisperReady: Boolean = false,
    val whisperAsked: Boolean = false,
    val sizes: MySizes = MySizes(),
    val stockWatches: List<StockWatch> = emptyList(),
    /** The last barcode no source could name — so "this barcode is…"
     *  knows which number the shopper is teaching. */
    val lastUnknownBarcode: String? = null,
    /** Increments each time a photo is requested ("take it", or the
     *  steady detector); the camera screen watches this number. */
    val photoRequest: Int = 0,
    /** True when the results on screen came from shared memory — no live
     *  web search was run for them. */
    val fromSharedMemory: Boolean = false,
    /** The shopper's choice: share item facts (never personal) or not. */
    val shareMemoryEnabled: Boolean = true,
    /** "barcode" when the photo is a barcode fallback (the vision prompt
     *  reads digits then); null for a normal "what is this?" photo. */
    val identifyMode: String? = null,
    /** Owner page: unlocked when a valid owner session cookie is kept. */
    val ownerUnlocked: Boolean = false,
    val ownerLoading: Boolean = false,
    val ownerUsage: OwnerUsageResponse? = null,
    val ownerError: String? = null,
    val ownerTriesLeft: Int? = null,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val store = LocalStore(application)
    private val speech = SpeechEngine(application)
    private val callHandler = CallHandler(application)
    private val conversation = ConversationManager()
    private val reviewsReader = ReviewsReader(AinShopApi)
    private val couponFinder = CouponFinder(AinShopApi)
    private val storeInfoProvider = StoreInfoProvider(AinShopApi)
    private val ownerApi = OwnerApi(store)
    private val gson = Gson()

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<UiEvent> = _events.asSharedFlow()

    private val searchScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    /** query-key → (response, when it arrived). Repeats within ~5 minutes
     *  come back fast; after that the search goes live again. */
    private data class CachedSearch(val response: SearchResponse, val at: Long)
    private val searchCache = HashMap<String, CachedSearch>()
    private val cacheTtlMs = 5 * 60 * 1000L

    /** Countries a place choice can name ("I'm looking to buy in England"). */
    private val placeCountries = mapOf(
        "england" to "GB", "united kingdom" to "GB", "uk" to "GB", "britain" to "GB",
        "scotland" to "GB", "wales" to "GB",
        "america" to "US", "united states" to "US", "usa" to "US", "us" to "US",
        "canada" to "CA", "israel" to "IL", "australia" to "AU", "france" to "FR",
        "germany" to "DE", "spain" to "ES", "italy" to "IT", "netherlands" to "NL",
        "ireland" to "IE", "mexico" to "MX", "india" to "IN", "japan" to "JP",
        "brazil" to "BR", "new zealand" to "NZ",
    )

    private var wasHandsFreeBeforeCall = false
    private var listeningLoopActive = false

    init {
        speech.init { }
        callHandler.start()
        viewModelScope.launch {
            store.language.collect { code ->
                _state.update { it.copy(language = code) }
                speech.setLanguage(code)
            }
        }
        viewModelScope.launch {
            store.speed.collect { speed ->
                _state.update { it.copy(speed = speed) }
                speech.setSpeed(speed)
            }
        }
        viewModelScope.launch { store.place.collect { _state.update { s -> s.copy(place = it) } } }
        viewModelScope.launch { store.favorites.collect { _state.update { s -> s.copy(favorites = it) } } }
        viewModelScope.launch { store.shoppingList.collect { _state.update { s -> s.copy(shoppingList = it) } } }
        viewModelScope.launch { store.watchlist.collect { _state.update { s -> s.copy(watchlist = it) } } }
        viewModelScope.launch { store.history.collect { _state.update { s -> s.copy(history = it) } } }
        viewModelScope.launch { store.openStores.collect { _state.update { s -> s.copy(openStores = it) } } }
        viewModelScope.launch { store.activeStore.collect { _state.update { s -> s.copy(activeStore = it) } } }
        viewModelScope.launch { store.roundupEnabled.collect { _state.update { s -> s.copy(roundupEnabled = it) } } }
        viewModelScope.launch { store.sizes.collect { _state.update { s -> s.copy(sizes = it) } } }
        viewModelScope.launch { store.stockWatches.collect { _state.update { s -> s.copy(stockWatches = it) } } }
        viewModelScope.launch { store.shareMemoryEnabled.collect { _state.update { s -> s.copy(shareMemoryEnabled = it) } } }
        viewModelScope.launch {
            // A kept owner session: check it still works; if it expired,
            // the owner page asks for the PIN again.
            when (val result = ownerApi.usage()) {
                is OwnerApi.UsageResult.Ok -> _state.update { it.copy(ownerUnlocked = true, ownerUsage = result.value) }
                else -> Unit
            }
        }
        viewModelScope.launch { store.whisperAsked.collect { _state.update { s -> s.copy(whisperAsked = it) } } }
        viewModelScope.launch {
            speech.isSpeaking.collect { _state.update { s -> s.copy(isSpeaking = it) } }
        }
        viewModelScope.launch {
            speech.isListening.collect { _state.update { s -> s.copy(isListening = it) } }
        }
        viewModelScope.launch {
            callHandler.inCall.collect { inCall ->
                _state.update { it.copy(inCall = inCall) }
                if (inCall) pauseForCall() else resumeAfterCall()
            }
        }
        viewModelScope.launch {
            // Restore the last session (a call, a killed app) — same search,
            // same results, nothing lost.
            val json = store.lastSession.firstOrNull() ?: return@launch
            runCatching {
                val snap = gson.fromJson(json, SearchSnapshot::class.java)
                if (snap != null && System.currentTimeMillis() - snap.at < 24 * 60 * 60 * 1000L) {
                    conversation.restore(snap)
                    _state.update {
                        it.copy(
                            query = snap.query, results = snap.results, totalResults = snap.total,
                            shownCount = snap.shown.coerceAtLeast(3).coerceAtMost(snap.results.size),
                            screen = if (snap.results.isNotEmpty()) AppScreen.RESULTS else AppScreen.HOME,
                        )
                    }
                }
            }
        }
        viewModelScope.launch {
            _state.update { it.copy(whisperReady = WhisperFallback.isAvailable(getApplication())) }
        }
    }

    // ---- speaking + listening ----

    /** Speak, then (when hands-free) listen again. */
    fun speak(text: String, thenListen: Boolean = false) {
        if (text.isBlank()) return
        _state.update { it.copy(lastSpoken = text, statusText = text) }
        speech.speak(text) {
            if (thenListen && listeningLoopActive && !_state.value.inCall) listenOnce()
        }
    }

    fun stopSpeaking() = speech.stopSpeaking()

    /** Start the hands-free loop: listen → act → speak → listen again. */
    fun startHandsFree() {
        listeningLoopActive = true
        _state.update { it.copy(handsFree = true) }
        speak("I'm listening. What are you looking for?", thenListen = true)
    }

    fun stopHandsFree() {
        listeningLoopActive = false
        speech.stopListening()
        _state.update { it.copy(handsFree = false) }
    }

    fun listenOnce() {
        if (_state.value.inCall) return
        speech.listen(
            languageCode = _state.value.language,
            onPartial = {},
            onFinal = { heard -> handleHeard(heard) },
            onError = { error ->
                if (error == "language") {
                    // The phone's own hearing doesn't cover this language:
                    // offer the on-phone Whisper backup once, then keep going.
                    offerWhisperFallback()
                }
                if (listeningLoopActive && !_state.value.inCall) {
                    // A missed sentence is not a failure — listen again.
                    searchScope.launch { delay(400); listenOnce() }
                }
            },
        )
    }

    private fun offerWhisperFallback() {
        viewModelScope.launch {
            if (store.whisperAsked.firstOrNull() == true) return@launch
            store.setWhisperAsked()
            speak(
                "This phone's own hearing doesn't cover that language. " +
                    "I can use Whisper on the phone instead — it works in 99 languages. " +
                    "Shall I download it? It's about 75 megabytes, once.",
                thenListen = true,
            )
            conversation.askConfirm(
                ConfirmRequest(ConfirmKind.WATCH, "download Whisper", payload = "whisper-download")
            )
        }
    }

    // ---- what was heard ----

    fun handleHeard(raw: String) {
        if (VoiceCommands.isNoise(raw)) return
        val s = _state.value
        // A yes/no answer to a question the app just asked.
        val pending = conversation.takeConfirm()
        val t = VoiceCommands.fix(raw)
        if (pending != null && (t == "yes" || t == "yeah" || t == "sure" || t == "ok" || t == "okay" || t == "כן")) {
            answerConfirm(pending, yes = true)
            return
        }
        if (pending != null && (t == "no" || t == "nope" || t == "לא")) {
            answerConfirm(pending, yes = false)
            return
        }
        if (pending != null) conversation.askConfirm(pending) // not an answer; keep it

        val action = VoiceCommands.parse(raw, s.results, s.currentIndex, s.favorites)
        dispatch(action, raw)
    }

    private fun answerConfirm(request: ConfirmRequest, yes: Boolean) {
        _state.update { it.copy(pendingQuestion = null) }
        if (!yes) {
            if (request.kind == ConfirmKind.SHARE) {
                val entry = runCatching { gson.fromJson(request.payload, SharedMemoryEntry::class.java) }.getOrNull()
                speak("Okay, it stays on this phone only.")
                if (entry != null) search(entry.name)
            } else {
                speak("Okay, I won't.")
            }
            if (listeningLoopActive) listenOnce()
            return
        }
        when (request.kind) {
            ConfirmKind.BUY -> openResultConfirmed(request.index)
            ConfirmKind.DELETE -> {
                viewModelScope.launch {
                    when (request.payload) {
                        "delete-all" -> { store.clearAll(); speak("Everything on this phone is deleted.") }
                        "forget-location" -> { store.forgetPlace(); speak("I've forgotten your place.") }
                        else -> {
                            val parts = request.payload.split("|")
                            if (parts.size == 2) {
                                store.removeFromList(parts[1])
                                speak("Removed ${parts[0]} from your list.")
                            }
                        }
                    }
                }
            }
            ConfirmKind.REORDER -> {
                viewModelScope.launch {
                    val entry = store.history.firstOrNull().firstOrNull { it.url == request.payload }
                    if (entry != null) {
                        store.addToList(ListItem(entry.title, entry.price, entry.currency, entry.store, entry.url, entry.image))
                        _events.tryEmit(UiEvent.OpenBrowser(entry.url))
                        speak("Opening ${entry.title} at ${entry.store}.")
                    }
                }
            }
            ConfirmKind.WATCH -> {
                if (request.payload == "whisper-download") {
                    viewModelScope.launch {
                        speak("Downloading Whisper now. I'll tell you when it's ready.")
                        val ok = WhisperFallback.downloadModel(getApplication()) { }
                        if (ok) speak("Whisper is ready. I'll use it when the phone's own hearing doesn't cover a language.")
                        else speak("The download didn't work just now. I'll keep using the phone's own hearing.")
                    }
                }
            }
            ConfirmKind.ROUNDUP_CHECK -> checkWatchlist(announce = true)
            ConfirmKind.SHARE -> {
                // A user-taught fact, confirmed by voice. Share it (item
                // facts only — never personal), then find the item.
                val entry = runCatching { gson.fromJson(request.payload, SharedMemoryEntry::class.java) }.getOrNull()
                if (entry == null) {
                    speak("I couldn't share that just now.")
                } else {
                    viewModelScope.launch {
                        when (SharedMemoryApi.teach(entry, "user")) {
                            is SharedMemoryApi.Result.Ok -> speak("Shared — other shoppers will find it instantly now.", thenListen = false)
                            is SharedMemoryApi.Result.Err -> speak("The shared memory isn't available yet, so it stays on this phone.", thenListen = false)
                        }
                        search(entry.name)
                    }
                }
            }
        }
        if (listeningLoopActive) listenOnce()
    }

    // ---- dispatch ----

    fun dispatch(action: VoiceAction, raw: String = "") {
        when (action) {
            is VoiceAction.Search -> searchWithPlace(action.query)
            VoiceAction.More -> searchMore()
            VoiceAction.Previous -> searchPrevious()
            VoiceAction.GoBack -> goBack()
            VoiceAction.StartOver -> startOver()
            VoiceAction.Stop -> { stopSpeaking(); speech.stopListening(); speak("Stopped.") }
            is VoiceAction.OpenResult -> requestOpen(action.index)
            is VoiceAction.DescribeResult -> describeResult(action.index)
            is VoiceAction.AddToList -> addResultToList(action.index)
            is VoiceAction.RememberWatch -> rememberWatch(action.index, action.targetPrice)
            is VoiceAction.WatchByWords -> watchByWords(action.query, action.targetPrice)
            VoiceAction.CheckWatchlist -> checkWatchlist(announce = true)
            is VoiceAction.GoToStore -> goToStore(action.name)
            VoiceAction.AllStores -> goToAllStores()
            VoiceAction.MyList -> goToLists()
            VoiceAction.BuyAgain -> goToLists(buyAgain = true)
            is VoiceAction.Reorder -> reorder(action.name)
            is VoiceAction.TrackOrder -> trackOrder(action.store)
            is VoiceAction.ReturnItem -> returnItem(action.store)
            VoiceAction.Deals -> dealsSummary()
            VoiceAction.Roundup -> roundup()
            VoiceAction.StoresNearMe -> storesNearMe()
            is VoiceAction.FastestDelivery -> fastestDelivery(action.query)
            VoiceAction.Help -> help()
            VoiceAction.Settings -> _state.update { it.copy(screen = AppScreen.SETTINGS) }
            is VoiceAction.SetLanguage -> setLanguage(action.code)
            is VoiceAction.SetSpeed -> setSpeed(action.speed)
            VoiceAction.ForgetLocation -> askConfirmDelete("forget-location", "Shall I forget your saved place?")
            VoiceAction.DeleteData -> askConfirmDelete("delete-all", "This deletes everything on this phone — your list, watched items and history. Are you sure?")
            is VoiceAction.Feedback -> recordFeedback(action.verdict, action.index)
            is VoiceAction.ReportMistake -> reportMistake(action.index)
            VoiceAction.MiniWindow -> enterMiniWindow()
            VoiceAction.FullWindow -> exitMiniWindow()
            VoiceAction.ConfirmYes -> { /* handled in handleHeard */ }
            VoiceAction.ConfirmNo -> { /* handled in handleHeard */ }
            VoiceAction.ScanBarcode -> _state.update { it.copy(screen = AppScreen.BARCODE) }
            VoiceAction.Identify -> openIdentify(null)
            is VoiceAction.ReadReviews -> readReviews(action.index)
            is VoiceAction.Compare -> compareResults(action.first, action.second)
            is VoiceAction.FindCoupon -> findCoupons(action.store)
            is VoiceAction.CallStore -> callStore(action.store)
            is VoiceAction.PriceHistory -> priceHistory(action.index)
            is VoiceAction.TellAboutStore -> tellAboutStore(action.store)
            is VoiceAction.SetSize -> setSize(action.kind, action.value)
            is VoiceAction.SearchInMySize -> searchInMySize(action.kind)
            is VoiceAction.MySizes -> mySizes(action.kind)
            is VoiceAction.ReturnWindow -> returnWindow(action.index)
            is VoiceAction.BackInStockWatch -> backInStockWatch(action.index)
            VoiceAction.CheckStockWatches -> checkStockWatches()
            is VoiceAction.TeachBarcode -> teachBarcode(action.name)
            VoiceAction.TakePhoto -> requestPhotoCapture()
            is VoiceAction.TeachAisle -> teachAisle(action.aisle, action.shelf)
            is VoiceAction.AskAisle -> askAisle(action.index)
            VoiceAction.Owner -> openOwner()
            VoiceAction.ReadOwnerNumbers -> speakOwnerNumbers()
            is VoiceAction.OwnerLogin -> ownerLogin(action.pin)
            is VoiceAction.AddFavorite -> addFavorite(action.store)
            is VoiceAction.RemoveFavorite -> removeFavorite(action.store)
            VoiceAction.ListFavorites -> listFavorites()
            is VoiceAction.Unknown -> {
                // The local parser didn't know it and it isn't noise:
                // ask the server's natural-language interpreter.
                interpretFallback(raw)
            }
        }
    }

    private fun askConfirmDelete(payload: String, question: String) {
        conversation.askConfirm(ConfirmRequest(ConfirmKind.DELETE, question, payload = payload))
        _state.update { it.copy(pendingQuestion = question) }
        speak(question, thenListen = true)
    }

    // ---- search: whole web, top 3 + count, 15-second cap, 5-minute cache ----

    /** A search, with a place choice ("in England") taken out of the words. */
    fun searchWithPlace(rawQuery: String) {
        val (query, country, placeName) = extractPlace(rawQuery)
        search(query, country = country, placeName = placeName)
    }

    private fun extractPlace(raw: String): Triple<String, String, String?> {
        val t = VoiceCommands.fix(raw)
        val m = Regex("\\b(?:in|from)\\s+([a-z][a-z ]{2,30})$").find(t)
        val place = m?.groupValues?.get(1)?.trim()
        if (place != null) {
            val code = placeCountries[place] ?: placeCountries.entries.firstOrNull { place.startsWith(it.key) }?.value
            if (code != null) {
                val query = t.removeSuffix(m.value).trim()
                    .removePrefix("search for ").removePrefix("search ").removePrefix("shop for ").removePrefix("buy ")
                    .trim()
                return Triple(query.ifEmpty { raw.trim() }, code, place)
            }
        }
        return Triple(raw.trim(), _state.value.place?.country ?: "US", null)
    }

    fun search(
        query: String,
        country: String = _state.value.place?.country ?: "US",
        placeName: String? = null,
        storeScope: String? = null,
        fresh: Boolean = false,
        fast: String? = null,
    ) {
        val s = _state.value
        val request = SearchRequest(
            query = query,
            stores = storeScope?.let { listOf(it) } ?: emptyList(),
            near = placeName ?: "",
            nearMe = placeName == null && s.place != null,
            country = country,
            currency = "USD",
            fast = fast,
            fresh = fresh,
            zip = s.place?.zip ?: "",
        )
        val cacheKey = listOf(query.lowercase(), storeScope ?: "", placeName ?: "", country, fast ?: "").joinToString("|")
        if (!fresh) {
            val cached = searchCache[cacheKey]
            if (cached != null && System.currentTimeMillis() - cached.at < cacheTtlMs) {
                applySearchResult(query, cached.response, fromCache = true)
                return
            }
        }
        _state.update { it.copy(statusText = "Searching the whole web for $query…", screen = AppScreen.RESULTS) }
        searchScope.launch {
            // Shared pure memory first: an item someone already remembered
            // answers instantly, with no live web search. A slow or
            // missing memory service never delays the live search.
            if (storeScope == null && fast == null && placeName == null && _state.value.shareMemoryEnabled) {
                val mem = withTimeoutOrNull(5_000L) { SharedMemoryApi.lookupByQuery(query) }
                if (mem is SharedMemoryApi.Result.Ok && mem.value != null) {
                    applyMemoryEntry(query, mem.value)
                    return@launch
                }
            }
            // 15-second cap: the first spoken answer never hangs.
            val first = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }
            if (first == null) {
                speak("Still checking — I'll read the first results as soon as they come in.", thenListen = false)
                // Keep checking in the background; the answer lands when it lands.
                when (val done = AinShopApi.search(request)) {
                    is AinShopApi.Result.Ok -> applySearchResult(query, done.value)
                    is AinShopApi.Result.Err -> searchFailed(done.error, query)
                }
                return@launch
            }
            when (first) {
                is AinShopApi.Result.Ok -> {
                    if (!fresh) searchCache[cacheKey] = CachedSearch(first.value, System.currentTimeMillis())
                    applySearchResult(query, first.value)
                    if (first.value.partial) pollForRest(query, request, cacheKey)
                }
                is AinShopApi.Result.Err -> searchFailed(first.error, query)
            }
        }
    }

    private fun pollForRest(query: String, request: SearchRequest, cacheKey: String) {
        searchScope.launch {
            repeat(11) {
                delay(4_000)
                when (val r = AinShopApi.search(request.copy(fresh = true))) {
                    is AinShopApi.Result.Ok -> {
                        if (!r.value.partial) {
                            searchCache[cacheKey] = CachedSearch(r.value, System.currentTimeMillis())
                            applySearchResult(query, r.value, quiet = true)
                            return@launch
                        }
                    }
                    is AinShopApi.Result.Err -> return@launch
                }
            }
        }
    }

    private fun applySearchResult(query: String, response: SearchResponse, fromCache: Boolean = false, quiet: Boolean = false) {
        val favs = _state.value.favorites
        val ordered = response.products.sortedWith(
            compareByDescending<Product> { it.store in favs }.thenBy { it.price ?: Double.MAX_VALUE }
        )
        val total = response.total.takeIf { it > 0 } ?: ordered.size
        conversation.rememberSearch(query, ordered, total)
        _state.update {
            it.copy(
                query = query, results = ordered, totalResults = total,
                partial = response.partial, shownCount = minOf(3, ordered.size),
                currentIndex = if (ordered.isNotEmpty()) 0 else -1,
                screen = AppScreen.RESULTS, fromSharedMemory = false,
            )
        }
        viewModelScope.launch {
            store.recordSightings(ordered)
            store.saveLastSession(gson.toJson(conversation.toSnapshot()))
        }
        // A brand-new item gets remembered: the next person asking for it
        // gets the answer instantly. Public web facts only, in the
        // background — the answer is never held up by this.
        rememberProductsToMemory(ordered.take(3))
        if (quiet) return
        if (ordered.isEmpty()) {
            speak("I couldn't find anything for $query. Try different words, or say it again.")
            return
        }
        val top = ordered.take(3)
        val spoken = buildString {
            append("We found $total results for $query. Here are the top three. ")
            top.forEachIndexed { i, p ->
                append("${i + 1}. ${shortSpoken(p)}. ")
            }
            append("Say \"next\" for more, or say a number to hear one in detail.")
        }
        speak(spoken, thenListen = listeningLoopActive)
    }

    // ---- shared pure memory: instant answers, then remembering ----

    /** An item the shared memory already knows: answer instantly, with
     *  no live web search. The price is labelled with its age, and an
     *  old price is flagged honestly. */
    private fun applyMemoryEntry(query: String, entry: SharedMemoryEntry) {
        val latest = entry.latestPrice()
        val offer = entry.offers.firstOrNull()
        val product = Product(
            title = entry.name, brand = entry.brand.ifEmpty { null },
            store = offer?.store ?: latest?.store ?: "",
            price = latest?.price, currency = latest?.currency ?: "USD",
            url = offer?.url ?: "", rating = entry.rating, reviews = entry.reviews,
            inStock = offer?.inStock,
        )
        conversation.rememberSearch(query, listOf(product), 1)
        _state.update {
            it.copy(
                query = query, results = listOf(product), totalResults = 1,
                partial = false, shownCount = 1, currentIndex = 0,
                screen = AppScreen.RESULTS, fromSharedMemory = true,
            )
        }
        viewModelScope.launch { store.saveLastSession(gson.toJson(conversation.toSnapshot())) }
        val ageDays = latest?.let { (System.currentTimeMillis() - it.at) / 86_400_000L } ?: -1
        val spoken = buildString {
            append("From shared memory — no search needed. ")
            append("${entry.name}. ")
            if (latest != null) {
                append("${Money.speak(latest.price, latest.currency)} at ${latest.store}. ")
                if (ageDays > 7) append("That price is from $ageDays days ago — say search live if you want it checked now. ")
            } else {
                append("No price remembered yet. ")
            }
            val aisle = entry.aisles.firstOrNull()
            if (aisle != null) {
                append("In ${aisle.store} it sits in aisle ${aisle.aisle}")
                if (aisle.shelf.isNotBlank()) append(", shelf ${aisle.shelf}")
                append(". ")
            }
            if (entry.allergens.isNotEmpty()) append("Allergens: ${entry.allergens.joinToString(", ")}. ")
            if (entry.photoFacts.isNotBlank()) append("From a photo: ${entry.photoFacts} ")
        }
        speak(spoken.toString().trim(), thenListen = listeningLoopActive)
    }

    /** Remember live-search results in the shared memory (public web
     *  facts only). Background, best-effort: a missing memory service
     *  changes nothing about the answer. */
    private fun rememberProductsToMemory(products: List<Product>) {
        if (!_state.value.shareMemoryEnabled || products.isEmpty()) return
        searchScope.launch {
            for (p in products) {
                SharedMemoryApi.teach(SharedMemoryEntry.Companion.fromProduct(p, _state.value.query), "web")
            }
        }
    }

    private fun rememberEntryToMemory(entry: SharedMemoryEntry?, origin: String) {
        if (entry == null || !_state.value.shareMemoryEnabled) return
        searchScope.launch { SharedMemoryApi.teach(entry, origin) }
    }

    /** "Where is this in the store?" — the on-phone aisle first, then
     *  the shared memory. If nobody taught it, say so — never guess. */
    private fun askAisle(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        viewModelScope.launch {
            val mine = store.myAisleFor(p.store)
            if (mine != null) {
                speak("${p.title} sits in aisle ${mine.aisle} at ${p.store}" + if (mine.shelf.isNotBlank()) ", shelf ${mine.shelf}" else "" + ".", thenListen = listeningLoopActive)
                return@launch
            }
            val mem = withTimeoutOrNull(5_000L) { SharedMemoryApi.lookupByQuery(p.title) }
            val aisle = (mem as? SharedMemoryApi.Result.Ok)?.value
                ?.aisles?.firstOrNull { it.store.equals(p.store, ignoreCase = true) }
            if (aisle != null) {
                speak("${p.title} sits in aisle ${aisle.aisle} at ${p.store}" + if (aisle.shelf.isNotBlank()) ", shelf ${aisle.shelf}" else "" + ".", thenListen = listeningLoopActive)
            } else {
                speak("Nobody has taught me where ${p.title} sits in ${p.store} yet. If you know, say: this is in aisle 5.", thenListen = listeningLoopActive)
            }
        }
    }

    /** "This is in aisle 5" — saved on this phone at once; shared only
     *  after a voice yes. */
    private fun teachAisle(aisle: String, shelf: String) {
        val s = _state.value
        val p = s.results.getOrNull(s.currentIndex) ?: s.results.firstOrNull()
        if (p == null) {
            speak("I need an item on screen first — search for it, then tell me the aisle.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            store.saveMyAisle(MemoryAisle(store = p.store, aisle = aisle, shelf = shelf))
            val entry = SharedMemoryEntry.Companion.fromProduct(p, s.query).copy(
                aisles = listOf(MemoryAisle(store = p.store, aisle = aisle, shelf = shelf)),
                origin = "user",
            )
            val question = "Shall I share that ${p.title} is in aisle $aisle at ${p.store} with other shoppers?"
            conversation.askConfirm(ConfirmRequest(ConfirmKind.SHARE, question, payload = gson.toJson(entry)))
            _state.update { it.copy(pendingQuestion = question) }
            speak("Saved on this phone — aisle $aisle at ${p.store}. $question", thenListen = true)
        }
    }

    fun setShareMemoryEnabled(enabled: Boolean) {
        viewModelScope.launch {
            store.setShareMemoryEnabled(enabled)
            speak(
                if (enabled) "Shared memory is on. I'll share item facts only — never anything personal."
                else "Shared memory is off. Nothing will leave this phone.",
                thenListen = listeningLoopActive,
            )
        }
    }

    private fun searchFailed(error: String, query: String) {
        val message = when (error) {
            "offline" -> "I'm offline just now, so I can't search. Check your connection and try again."
            "timeout" -> "The search took too long and I stopped it, so it never hangs. Try again."
            "rate_limited" -> "Too many searches just now. Give it a minute and try again."
            "off_topic" -> "I only help with shopping, so I can't search for that."
            else -> "The search didn't work just now. Try again."
        }
        speak(message, thenListen = listeningLoopActive)
    }

    private fun shortSpoken(p: Product): String {
        val price = p.price?.let { Money.speak(it, p.currency) } ?: "price not shown"
        val stock = when (p.inStock) { true -> "in stock"; false -> "out of stock"; null -> "" }
        return "${p.title}, $price at ${p.store}" + if (stock.isNotEmpty()) ", $stock" else ""
    }

    fun searchMore() {
        val s = _state.value
        if (s.results.isEmpty()) { speak("There's nothing to show more of yet. Tell me what you're looking for."); return }
        val next = (s.shownCount + 3).coerceAtMost(s.results.size)
        if (next == s.shownCount) { speak("That's all ${s.results.size} results I have for ${s.query}."); return }
        val chunk = s.results.subList(s.shownCount, next)
        _state.update { it.copy(shownCount = next) }
        conversation.rememberMore(next)
        val spoken = chunk.mapIndexed { i, p -> "${s.shownCount + i + 1}. ${shortSpoken(p)}." }.joinToString(" ")
        speak(spoken, thenListen = listeningLoopActive)
    }

    private fun searchPrevious() {
        val s = _state.value
        if (s.shownCount <= 3) { speak("You're already at the first three."); return }
        val prev = (s.shownCount - 3).coerceAtLeast(3)
        val chunk = s.results.subList(prev - 3, prev)
        _state.update { it.copy(shownCount = prev) }
        speak(chunk.mapIndexed { i, p -> "${prev - 2 + i}. ${shortSpoken(p)}." }.joinToString(" "), thenListen = listeningLoopActive)
    }

    private fun goBack() {
        _state.update { it.copy(screen = AppScreen.HOME) }
        speak("Back at the start. What are you looking for?", thenListen = listeningLoopActive)
    }

    private fun startOver() {
        conversation.clearSearch()
        _state.update { it.copy(screen = AppScreen.HOME, results = emptyList(), totalResults = 0, shownCount = 0, query = "", currentIndex = -1) }
        speak("Starting over. What are you looking for?", thenListen = listeningLoopActive)
    }

    // ---- one result: describe, open, buy ----

    private fun requestOpen(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        val question = "Shall I open ${p.title} at ${p.store}" +
            (p.price?.let { " for ${Money.speak(it, p.currency)}" } ?: "") + "?"
        conversation.askConfirm(ConfirmRequest(ConfirmKind.BUY, question, index = index))
        _state.update { it.copy(pendingQuestion = question, currentIndex = index) }
        speak(question, thenListen = true)
    }

    fun openResultConfirmed(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: return
        _state.update { it.copy(currentIndex = index) }
        viewModelScope.launch {
            store.recordHistory(HistoryEntry(p.title, p.price, p.currency, p.store, p.url, p.image))
        }
        _events.tryEmit(UiEvent.OpenBrowser(p.url))
        speak("Opening ${p.title} at ${p.store}. The store's own page will take your payment — I never see your card.", thenListen = listeningLoopActive)
    }

    fun describeResult(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        _state.update { it.copy(currentIndex = index) }
        viewModelScope.launch {
            when (val d = AinShopApi.details(p.url, p.store, p.image)) {
                is AinShopApi.Result.Ok -> {
                    val det = d.value
                    val parts = ArrayList<String>()
                    if (!det.looks.isNullOrBlank()) parts.add(det.looks)
                    if (!det.description.isNullOrBlank()) parts.add(det.description)
                    det.highlights.take(2).forEach { parts.add(it) }
                    val price = det.price?.let { Money.speak(it, det.currency ?: p.currency) }
                        ?: p.price?.let { Money.speak(it, p.currency) }
                    val rating = det.rating?.let { "$it stars" + (det.reviews?.let { r -> " from $r reviews" } ?: "") }
                        ?: p.rating?.let { "$it stars" }
                    speak(
                        "${p.title}. " +
                            (price?.let { "It costs $it. " } ?: "") +
                            (rating?.let { "Rated $it. " } ?: "") +
                            (det.inStock?.let { if (it) "In stock. " else "Out of stock. " } ?: "") +
                            parts.joinToString(" "),
                        thenListen = listeningLoopActive,
                    )
                }
                is AinShopApi.Result.Err -> speak("${p.title}. I couldn't read its page just now.", thenListen = listeningLoopActive)
            }
        }
    }

    // ---- the five features from Nov 20, part 2 ----

    /** "What do buyers say about this?" — rating + description + what the
     *  web says. Never invents a review. */
    private fun readReviews(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        _state.update { it.copy(currentIndex = index) }
        viewModelScope.launch {
            val summary = reviewsReader.read(p, _state.value.language)
            speak(summary.spoken, thenListen = listeningLoopActive)
        }
    }

    /** "Compare the first one and the second one" — price, rating and key
     *  differences, spoken side by side. */
    private fun compareResults(first: Int, second: Int) {
        val s = _state.value
        if (first < 0 || second < 0 || first >= s.results.size || second >= s.results.size || first == second) {
            speak("I need two results to compare. Say \"compare the first one and the second one\".", thenListen = listeningLoopActive)
            return
        }
        val a = s.results[first]
        val b = s.results[second]
        speak(
            Comparison.speak(Comparison.ComparedPair(a, b), ordinalLabel(first), ordinalLabel(second)),
            thenListen = listeningLoopActive,
        )
    }

    private fun ordinalLabel(index: Int): String = when (index) {
        0 -> "the first one"; 1 -> "the second one"; 2 -> "the third one"
        3 -> "the fourth one"; 4 -> "the fifth one"; else -> "number ${index + 1}"
    }

    /** "Is there a coupon for Walmart?" — from the web, read as found,
     *  with the warning. Never invents a code. */
    private fun findCoupons(store: String?) {
        val s = _state.value
        val storeName = store ?: s.results.getOrNull(s.currentIndex)?.store
        val product = if (store == null) s.results.getOrNull(s.currentIndex) else null
        viewModelScope.launch {
            val result = couponFinder.find(storeName, product)
            speak(couponFinder.speak(result, storeName), thenListen = listeningLoopActive)
        }
    }

    /** "Call Walmart" — opens the dialer with the store's public number
     *  shown. The app never dials by itself. This is different from
     *  pausing for an incoming call (see CallHandler). */
    private fun callStore(store: String?) {
        val s = _state.value
        val name = store
            ?: s.results.getOrNull(s.currentIndex)?.store
            ?: s.activeStore
        if (name.isNullOrBlank()) {
            speak("Which store shall I call?", thenListen = listeningLoopActive)
            return
        }
        val contact = StoreDirectory.byName(name)
        if (contact?.phone.isNullOrBlank()) {
            speak("I don't have a public phone number for $name.", thenListen = listeningLoopActive)
            return
        }
        val readable = contact!!.phone!!.replace(Regex("[^0-9]"), " ").replace(Regex("\\s+"), " ").trim()
        speak(
            "Calling $name at $readable. Your phone will show the number first — you choose to call.",
            thenListen = false,
        )
        _events.tryEmit(UiEvent.Dial(contact.phone!!))
    }

    /** "Was this cheaper before?" — only from prices this phone has
     *  actually seen (searches + watchlist). Never guessed. */
    private fun priceHistory(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        val current = p.price
        if (current == null) {
            speak("This one has no price shown, so I can't compare it.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            val sightings = store.priceHistoryFor(p.title, p.store, p.url)
            val watch = store.watchlist.firstOrNull()
                .firstOrNull { it.url == p.url || (it.title == p.title && it.store == p.store) }
            val priorPrices = sightings.map { it.price } +
                listOfNotNull(watch?.firstPrice, watch?.lastPrice)
            if (priorPrices.size <= 1) {
                speak(
                    "I haven't seen ${p.title} before, so I can't tell yet whether this is the best price. " +
                        "I'll remember ${Money.speak(current, p.currency)} from now on.",
                    thenListen = listeningLoopActive,
                )
                return@launch
            }
            val lowest = priorPrices.min()
            when {
                lowest < current -> speak(
                    "Yes — it was cheaper before. The lowest I've seen is ${Money.speak(lowest, p.currency)}, " +
                        "and it's ${Money.speak(current, p.currency)} now.",
                    thenListen = listeningLoopActive,
                )
                else -> speak(
                    "This is the best price I've seen so far — ${Money.speak(current, p.currency)}.",
                    thenListen = listeningLoopActive,
                )
            }
        }
    }

    /** "Tell me about Walmart" — nearest location, hours, phone, delivery,
     *  online-only. Only verified facts; unknowns are said as unknown. */
    private fun tellAboutStore(store: String?) {
        val s = _state.value
        val name = store
            ?: s.activeStore
            ?: s.results.getOrNull(s.currentIndex)?.store
            ?: s.results.firstOrNull()?.store
        if (name.isNullOrBlank()) {
            speak("Which store shall I tell you about?", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            val info = storeInfoProvider.tellMeAbout(name, _state.value.place)
            speak(storeInfoProvider.speak(info, _state.value.place), thenListen = listeningLoopActive)
        }
    }

    // ---- sizes: remembered on this phone only, men's clothing first ----

    private fun setSize(kind: String, value: String) {
        viewModelScope.launch {
            when (kind) {
                "pants" -> {
                    val parts = value.split("x")
                    if (parts.size == 2) {
                        store.setSize("pantsWaist", parts[0])
                        store.setSize("pantsLength", parts[1])
                        speak("Your pants size is saved as ${parts[0]} by ${parts[1]}.", thenListen = listeningLoopActive)
                    }
                }
                "shirt" -> { store.setSize("shirt", value); speak("Your shirt size is saved as $value.", thenListen = listeningLoopActive) }
                "shoe" -> { store.setSize("shoe", value); speak("Your shoe size is saved as $value.", thenListen = listeningLoopActive) }
                "pantsWaist" -> { store.setSize("pantsWaist", value); speak("Your pants waist is saved as $value.", thenListen = listeningLoopActive) }
                "pantsLength" -> { store.setSize("pantsLength", value); speak("Your pants length is saved as $value.", thenListen = listeningLoopActive) }
            }
        }
    }

    /** "Show me shirts in my size" — the saved size goes into the search.
     *  If the size isn't saved, the app asks instead of guessing. */
    private fun searchInMySize(kind: String) {
        viewModelScope.launch {
            val sizes = store.sizes.firstOrNull() ?: MySizes()
            when (kind) {
                "shirt" -> {
                    if (sizes.shirt.isBlank()) {
                        speak("I don't have your shirt size saved yet. What is it? Say, for example, my shirt size is large.", thenListen = true)
                    } else search("men's shirts size ${sizes.shirt}")
                }
                "pants" -> {
                    if (sizes.pantsWaist.isBlank()) {
                        speak("I don't have your pants size saved yet. What is it? Say, for example, my pants are 34 by 32.", thenListen = true)
                    } else {
                        val size = if (sizes.pantsLength.isNotBlank()) "${sizes.pantsWaist}x${sizes.pantsLength}" else sizes.pantsWaist
                        search("men's pants size $size")
                    }
                }
                "shoe" -> {
                    if (sizes.shoe.isBlank()) {
                        speak("I don't have your shoe size saved yet. What is it? Say, for example, my shoe size is 10.", thenListen = true)
                    } else search("men's shoes size ${sizes.shoe}")
                }
            }
        }
    }

    private fun mySizes(kind: String?) {
        viewModelScope.launch {
            val sizes = store.sizes.firstOrNull() ?: MySizes()
            val out = when (kind) {
                "shirt" -> if (sizes.shirt.isBlank()) "I don't have your shirt size saved yet." else "Your shirt size is ${sizes.shirt}."
                "pants" -> if (sizes.pantsWaist.isBlank()) "I don't have your pants size saved yet." else "Your pants are ${sizes.pantsWaist}" + if (sizes.pantsLength.isNotBlank()) " by ${sizes.pantsLength}." else "."
                "shoe" -> if (sizes.shoe.isBlank()) "I don't have your shoe size saved yet." else "Your shoe size is ${sizes.shoe}."
                else -> {
                    val parts = ArrayList<String>()
                    parts.add(if (sizes.shirt.isBlank()) "no shirt size" else "shirt ${sizes.shirt}")
                    parts.add(if (sizes.pantsWaist.isBlank()) "no pants size" else "pants ${sizes.pantsWaist}" + if (sizes.pantsLength.isNotBlank()) " by ${sizes.pantsLength}" else "")
                    parts.add(if (sizes.shoe.isBlank()) "no shoe size" else "shoe ${sizes.shoe}")
                    "Your sizes: " + parts.joinToString(", ") + "."
                }
            }
            speak(out, thenListen = listeningLoopActive)
        }
    }

    // ---- return windows: the store's published window, or "I don't know" ----

    private fun returnWindow(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        val contact = StoreDirectory.byUrl(p.url) ?: StoreDirectory.byName(p.store)
        if (contact?.returnWindow.isNullOrBlank()) {
            speak("I don't know the return window for ${p.store}.", thenListen = listeningLoopActive)
            return
        }
        val note = contact!!.returnNote?.let { " $it." } ?: ""
        speak(
            "${contact.name} gives you ${contact.returnWindow} to return this.$note " +
                "Return windows can change, so the store's own page is the final word.",
            thenListen = listeningLoopActive,
        )
    }

    // ---- back in stock: watch what was out of stock, alert when it's back ----

    private fun backInStockWatch(index: Int) {
        val p = _state.value.results.getOrNull(index) ?: run {
            speak("I don't have a result number ${index + 1}."); return
        }
        if (p.inStock == true) {
            speak("That one is in stock now, so there's nothing to watch for.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            val added = store.addStockWatch(
                StockWatch(title = p.title, query = _state.value.query, store = p.store, url = p.url, lastPrice = p.price, currency = p.currency)
            )
            speak(
                if (added) "I'll watch it and tell you as soon as ${p.title} is back in stock at ${p.store}."
                else "I'm already watching that one for you.",
                thenListen = listeningLoopActive,
            )
        }
    }

    fun checkStockWatches() {
        viewModelScope.launch {
            val alerts = checkStockWatchesInternal()
            if (alerts.isEmpty()) {
                speak("Nothing you're watching is back in stock yet.", thenListen = listeningLoopActive)
            } else {
                speak(alerts.joinToString(" "), thenListen = listeningLoopActive)
            }
        }
    }

    /** One fresh check of every stock watch. Returns spoken alerts for
     *  items that are back in stock; those watches are removed. An item
     *  that still isn't listed, or is still out of stock, keeps waiting. */
    private suspend fun checkStockWatchesInternal(): List<String> {
        val watches = store.stockWatches.firstOrNull().orEmpty()
        if (watches.isEmpty()) return emptyList()
        val alerts = ArrayList<String>()
        for (watch in watches) {
            val request = SearchRequest(query = watch.query, country = _state.value.place?.country ?: "US", currency = "USD", fresh = true)
            when (val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }) {
                is AinShopApi.Result.Ok -> {
                    val match = result.value.products.firstOrNull { p ->
                        (watch.url.isNotBlank() && p.url == watch.url) ||
                            (p.title.equals(watch.title, ignoreCase = true) && p.store == watch.store)
                    }
                    if (match != null && match.inStock == true) {
                        val price = match.price?.let { " for ${Money.speak(it, match.currency)}" } ?: ""
                        alerts.add("Good news — ${watch.title} is back in stock at ${match.store}$price.")
                        store.removeStockWatch(watch.url.ifEmpty { watch.title })
                    }
                }
                else -> Unit // A failed check changes nothing; the watch stays.
            }
        }
        return alerts
    }

    // ---- shopping list, Buy again, reorder ----

    private fun addResultToList(index: Int?) {
        val s = _state.value
        val p = index?.let { s.results.getOrNull(it) } ?: s.results.getOrNull(s.currentIndex)
        if (p == null) { speak("There's nothing to add to your list yet."); return }
        viewModelScope.launch {
            store.addToList(ListItem(p.title, p.price, p.currency, p.store, p.url, p.image))
            speak("Added ${p.title} to your list.", thenListen = listeningLoopActive)
        }
    }

    private fun goToLists(buyAgain: Boolean = false) {
        _state.update { it.copy(screen = AppScreen.LISTS) }
        if (buyAgain) {
            viewModelScope.launch {
                val bought = store.history.firstOrNull().orEmpty().take(5)
                if (bought.isEmpty()) {
                    speak("You haven't bought anything through the app yet, so there's nothing to buy again.", thenListen = listeningLoopActive)
                } else {
                    speak(
                        "Buy again: " + bought.mapIndexed { i, e -> "${i + 1}. ${e.title} at ${e.store}." }.joinToString(" ") +
                            " Say \"reorder\" and the name to buy one again.",
                        thenListen = listeningLoopActive,
                    )
                }
            }
        } else {
            val items = _state.value.shoppingList
            speak(
                if (items.isEmpty()) "Your list is empty."
                else "Your list: " + items.mapIndexed { i, e -> "${i + 1}. ${e.title}." }.joinToString(" "),
                thenListen = listeningLoopActive,
            )
        }
    }

    private fun reorder(name: String) {
        viewModelScope.launch {
            val entry = store.history.firstOrNull().orEmpty()
                .firstOrNull { it.title.contains(name, ignoreCase = true) || name.contains(it.title, ignoreCase = true) }
            if (entry == null) {
                speak("I can't find $name in what you bought before.", thenListen = listeningLoopActive)
                return@launch
            }
            val question = "Shall I order ${entry.title} again from ${entry.store}?"
            conversation.askConfirm(ConfirmRequest(ConfirmKind.REORDER, question, payload = entry.url))
            _state.update { it.copy(pendingQuestion = question) }
            speak(question, thenListen = true)
        }
    }

    // ---- watchlist: price-drop alerts + daily roundup ----

    private fun rememberWatch(index: Int?, targetPrice: Double?) {
        val s = _state.value
        val p = index?.let { s.results.getOrNull(it) } ?: s.results.getOrNull(s.currentIndex)
        if (p == null) { speak("There's nothing to watch yet."); return }
        viewModelScope.launch {
            val added = store.addWatch(
                WatchItem(title = p.title, query = s.query, store = p.store, url = p.url,
                    firstPrice = p.price, currency = p.currency, targetPrice = targetPrice, lastPrice = p.price)
            )
            speak(
                if (added) "I'll watch ${p.title} and tell you when the price drops" + (targetPrice?.let { " below ${Money.speak(it, p.currency)}" } ?: "") + "."
                else "Your watchlist is full — twenty items at most. Remove one first.",
                thenListen = listeningLoopActive,
            )
        }
    }

    private fun watchByWords(query: String, targetPrice: Double?) {
        viewModelScope.launch {
            val added = store.addWatch(
                WatchItem(title = query, query = query, targetPrice = targetPrice)
            )
            speak(
                if (added) "I'll watch for $query and tell you when the price drops" + (targetPrice?.let { " below ${Money.speak(it)}" } ?: "") + "."
                else "Your watchlist is full — twenty items at most. Remove one first.",
                thenListen = listeningLoopActive,
            )
        }
    }

    /** Fresh-check every watched item; speak every price drop and every
     *  item that came back in stock. A failed check changes nothing. */
    fun checkWatchlist(announce: Boolean) {
        viewModelScope.launch {
            val watches = store.watchlist.firstOrNull().orEmpty()
            val alerts = ArrayList<String>()
            for (watch in watches) {
                val request = SearchRequest(
                    query = watch.query, country = _state.value.place?.country ?: "US",
                    currency = watch.currency, fresh = true,
                )
                when (val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }) {
                    is AinShopApi.Result.Ok -> {
                        val cheapest = result.value.products
                            .filter { it.price != null }
                            .minByOrNull { it.price!! }
                        if (cheapest != null) {
                            val low = cheapest.price!!
                            val dropped = (watch.targetPrice != null && low <= watch.targetPrice!!) ||
                                (watch.firstPrice != null && low < watch.firstPrice!!) ||
                                (watch.lastPrice != null && low < watch.lastPrice!!)
                            if (dropped) {
                                alerts.add(
                                    "Price drop — ${watch.title} is now ${Money.speak(low, cheapest.currency)} at ${cheapest.store}" +
                                        (watch.firstPrice?.let { ", down from ${Money.speak(it, watch.currency)}" } ?: "") + "."
                                )
                            }
                            store.updateWatch(watch.copy(lastPrice = low, lastCheckedAt = System.currentTimeMillis()))
                        }
                    }
                    else -> Unit
                }
            }
            alerts.addAll(checkStockWatchesInternal())
            if (alerts.isEmpty()) {
                if (announce) speak("No price drops on your list today.", thenListen = listeningLoopActive)
            } else {
                speak(alerts.joinToString(" "), thenListen = listeningLoopActive)
            }
            store.setLastRoundup(System.currentTimeMillis())
        }
    }

    /** The daily spoken roundup: price drops on the list, read aloud. */
    private fun roundup() {
        speak("Checking your list for price drops.", thenListen = false)
        checkWatchlist(announce = true)
    }

    /** Spoken deals summary across favorite stores: one fresh search per
     *  favorite store (at most five), deals only. */
    private fun dealsSummary() {
        val favs = _state.value.favorites.take(5)
        if (favs.isEmpty()) {
            speak("You have no favorite stores yet. Say a store's name and I'll add it to your favorites.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            val deals = ArrayList<Product>()
            for (fav in favs) {
                val request = SearchRequest(query = "deals", stores = listOf(fav), country = _state.value.place?.country ?: "US", currency = "USD", fresh = true)
                when (val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }) {
                    is AinShopApi.Result.Ok -> {
                        deals.addAll(result.value.products.filter { it.wasPrice != null && it.price != null && it.price!! < it.wasPrice!! })
                    }
                    else -> Unit
                }
            }
            if (deals.isEmpty()) {
                speak("No deals at your favorite stores just now.", thenListen = listeningLoopActive)
            } else {
                val spoken = deals.take(5).mapIndexed { i, p ->
                    "${i + 1}. ${p.title}, ${Money.speak(p.price!!, p.currency)} at ${p.store}, down from ${Money.speak(p.wasPrice!!, p.currency)}."
                }.joinToString(" ")
                speak("Deals at your favorite stores: $spoken", thenListen = listeningLoopActive)
            }
        }
    }

    // ---- stores: go to one, all stores, near me, tracking, returns ----

    private fun goToStore(name: String) {
        viewModelScope.launch {
            store.setActiveStore(name)
            store.rememberStore(OpenStore(key = name.lowercase().replace(Regex("[^a-z0-9]"), ""), name = name, site = name, lastQuery = _state.value.query))
            when (val result = withTimeoutOrNull(15_000L) { AinShopApi.searchStore(name, _state.value.query.ifEmpty { "deals" }) }) {
                is AinShopApi.Result.Ok -> {
                    applySearchResult(
                        _state.value.query.ifEmpty { "deals" },
                        SearchResponse(products = result.value.products, total = result.value.total),
                    )
                }
                is AinShopApi.Result.Err -> speak("I couldn't open $name just now.", thenListen = listeningLoopActive)
                null -> speak("Opening $name is taking too long. Try again.", thenListen = listeningLoopActive)
            }
        }
    }

    private fun goToAllStores() {
        viewModelScope.launch {
            store.setActiveStore(null)
            val q = _state.value.query
            if (q.isBlank()) speak("Searching all stores. What are you looking for?", thenListen = true)
            else search(q)
        }
    }

    private fun storesNearMe() {
        val place = _state.value.place
        if (place == null) {
            speak("I don't have a place saved yet, so I can't find stores near you. Save your ZIP in settings first.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            when (val result = AinShopApi.nearby(place.zip, place.city, place.region, place.country)) {
                is AinShopApi.Result.Ok -> {
                    _state.update { it.copy(nearbyStores = result.value.stores, nearbyPlace = result.value.place, screen = AppScreen.STORES) }
                    val stores = result.value.stores
                    if (stores.isEmpty()) {
                        speak("I couldn't find stores near ${result.value.place ?: "you"} just now.", thenListen = listeningLoopActive)
                    } else {
                        val spoken = stores.take(5).mapIndexed { i, s ->
                            "${i + 1}. ${s.name}" + (s.address?.let { ", $it" } ?: "") + (s.hoursToday?.let { ", open $it today" } ?: "") + "."
                        }.joinToString(" ")
                        speak("Stores near you: $spoken", thenListen = listeningLoopActive)
                    }
                }
                is AinShopApi.Result.Err -> speak("I couldn't look up stores near you just now.", thenListen = listeningLoopActive)
            }
        }
    }

    private fun fastestDelivery(query: String?) {
        val q = query ?: _state.value.query
        if (q.isBlank()) { speak("What shall I find with the fastest delivery?"); return }
        // The server sorts fastest first; the top result is the fastest.
        search(q, fast = "delivery")
    }

    private fun trackOrder(storeName: String?) {
        val s = _state.value
        val name = storeName ?: s.activeStore ?: s.results.getOrNull(s.currentIndex)?.store
        val contact = name?.let { StoreDirectory.byName(it) }
        val url = contact?.trackUrl
        if (url == null) {
            speak("I don't have a tracking page for ${name ?: "that store"}.", thenListen = listeningLoopActive)
            return
        }
        _events.tryEmit(UiEvent.OpenBrowser(url))
        speak(
            "Opening ${contact.name}'s order tracking." + if (contact.trackNeedsSignIn) " You'll need to sign in there." else "",
            thenListen = listeningLoopActive,
        )
    }

    private fun returnItem(storeName: String?) {
        val s = _state.value
        val name = storeName ?: s.activeStore ?: s.results.getOrNull(s.currentIndex)?.store
        val contact = name?.let { StoreDirectory.byName(it) }
        val url = contact?.returnsUrl
        if (url == null) {
            speak("I don't have a returns page for ${name ?: "that store"}.", thenListen = listeningLoopActive)
            return
        }
        _events.tryEmit(UiEvent.OpenBrowser(url))
        speak(
            "Opening ${contact.name}'s returns page." + if (contact.returnsNeedsSignIn) " You'll need to sign in there." else "",
            thenListen = listeningLoopActive,
        )
    }

    // ---- settings, help, language, speed ----

    private fun setLanguage(code: String?) {
        if (code.isNullOrBlank()) {
            speak("Which language? Say English, Hebrew, Spanish — any of the fifty.", thenListen = true)
            return
        }
        viewModelScope.launch {
            store.setLanguage(code)
            val name = Languages.byCode(code).englishName
            speak("Language set to $name.", thenListen = listeningLoopActive)
        }
    }

    fun setLanguageByName(name: String) {
        val found = Languages.ALL.firstOrNull {
            it.englishName.equals(name, ignoreCase = true) || it.nativeName.equals(name, ignoreCase = true)
        }
        if (found == null) {
            speak("I don't know the language $name. Try English, Hebrew, or Spanish.", thenListen = listeningLoopActive)
            return
        }
        setLanguage(found.code)
    }

    private fun setSpeed(speed: String) {
        val value = when (speed) { "fast" -> ResponseSpeed.FAST; "slow" -> ResponseSpeed.SLOW; else -> ResponseSpeed.NORMAL }
        viewModelScope.launch {
            store.setSpeed(value)
            speak("Okay — ${if (value == ResponseSpeed.FAST) "faster" else if (value == ResponseSpeed.SLOW) "slower" else "normal"} speed.", thenListen = listeningLoopActive)
        }
    }

    fun setRoundupEnabled(enabled: Boolean) {
        viewModelScope.launch { store.setRoundupEnabled(enabled) }
    }

    private fun help() {
        speak(
            "You can say: find something, like \"find men's shoes\". Say \"next\" for more results, " +
                "\"the second one\" to hear it in detail, \"buy it\" to open it at the store. " +
                "Say \"add it to my list\", \"remember I'm looking for\" to watch a price, " +
                "\"scan barcode\", \"what is this\", \"stores near me\", \"tell me about Walmart\", " +
                "\"what do buyers say\", \"compare the first one and the second one\", " +
                "\"was this cheaper before\", \"call Walmart\", or \"mini window\" to keep me talking in a small window.",
            thenListen = listeningLoopActive,
        )
    }

    /** Anything the on-phone parser doesn't know: the server's
     *  natural-language interpreter, in any of the 50 languages. */
    private fun interpretFallback(raw: String) {
        viewModelScope.launch {
            when (val result = AinShopApi.interpret(raw, _state.value.language)) {
                is AinShopApi.Result.Ok -> {
                    val r = result.value
                    when (r.command) {
                        "search" -> if (!r.query.isNullOrBlank()) searchWithPlace(r.query) else speak("What shall I search for?", thenListen = true)
                        "more" -> searchMore()
                        "help" -> help()
                        "home" -> goBack()
                        "lists" -> goToLists()
                        "settings" -> _state.update { it.copy(screen = AppScreen.SETTINGS) }
                        else -> {
                            if (!r.answer.isNullOrBlank()) speak(r.answer, thenListen = listeningLoopActive)
                            else speak("I didn't catch that. Try saying it another way, or ask me what I can do.", thenListen = listeningLoopActive)
                        }
                    }
                }
                is AinShopApi.Result.Err -> speak("I didn't catch that. Try saying it another way.", thenListen = listeningLoopActive)
            }
        }
    }

    // ---- feedback + report a mistake: on this phone only ----

    private fun recordFeedback(verdict: String, index: Int?) {
        val s = _state.value
        val p = index?.let { s.results.getOrNull(it) } ?: s.results.getOrNull(s.currentIndex)
        if (p == null) { speak("Thanks — but there's nothing on screen to give feedback on."); return }
        viewModelScope.launch {
            store.recordFeedback(FeedbackEvent(p.title, p.store, p.url, s.query, verdict))
            speak("Thanks — noted on this phone only.", thenListen = listeningLoopActive)
        }
    }

    private fun reportMistake(index: Int?) {
        val s = _state.value
        val p = index?.let { s.results.getOrNull(it) } ?: s.results.getOrNull(s.currentIndex)
        if (p == null) { speak("There's nothing on screen to report."); return }
        viewModelScope.launch {
            store.recordTeaching(
                TeachingRecord(query = s.query, wrongTitle = p.title, wrongStore = p.store, whatWasWrong = "Shopper said this result was wrong.")
            )
            speak("Thanks. I've saved that on this phone so we can fix the rule — nothing is sent anywhere until you say so.", thenListen = listeningLoopActive)
        }
    }

    // ---- barcode + camera ----

    /** A scanned barcode number → what the product is. The lookup order:
     *    1. Taught on this phone ("this barcode is…") — answered at once.
     *    2. The server, which checks in order: Open Food Facts, Open
     *       Beauty Facts, Open Products Facts, Open Pet Food Facts, then
     *       UPCitemdb's free trial (100 lookups a day, no sign-up).
     *    3. A whole-web search for the barcode number itself.
     *  If nothing finds it: say so honestly, read the digits aloud, and
     *  offer to be taught. Never invent a product for a barcode. */
    fun onBarcodeRead(code: String, format: String) {
        val digits = code.filter { it.isDigit() }
        viewModelScope.launch {
            // 1. Taught on this phone.
            store.findBarcodeTeaching(digits)?.let { taught ->
                speak("That's ${taught.name}. You taught me that barcode.", thenListen = false)
                if (taught.name.isNotBlank()) search(taught.name)
                return@launch
            }
            // 1b. Shared pure memory: someone already remembered this barcode.
            val mem = withTimeoutOrNull(5_000L) { SharedMemoryApi.lookupByBarcode(digits) }
            if (mem is SharedMemoryApi.Result.Ok && mem.value != null) {
                val entry = mem.value!!
                speak(
                    "From shared memory — ${entry.name}" +
                        (entry.brand.ifBlank { null }?.let { ", by $it" } ?: "") + ". " +
                        (entry.allergens.takeIf { it.isNotEmpty() }?.let { "Allergens: ${it.joinToString(", ")}. " } ?: "") +
                        (entry.ingredients.takeIf { it.isNotBlank() }?.let { "Ingredients: $it. " } ?: ""),
                    thenListen = false,
                )
                search(entry.name)
                return@launch
            }
            // 2. The server's ordered lookup.
            when (val result = AinShopApi.barcode(code, format, _state.value.language)) {
                is AinShopApi.Result.Ok -> {
                    val b = result.value
                    if (b.found) {
                        _state.update { it.copy(lastUnknownBarcode = null) }
                        val name = b.product?.name ?: b.product?.title ?: "a product"
                        speak("That's $name" + (b.product?.brand?.let { ", by $it" } ?: "") + ".", thenListen = false)
                        // Remember it (public database facts, incl. allergens
                        // and ingredients for food) for the next person.
                        rememberEntryToMemory(SharedMemoryEntry.Companion.fromBarcode(b), "web")
                        if (b.searchQuery.isNotBlank()) search(b.searchQuery)
                        return@launch
                    }
                    if (b.error != null) {
                        // The check digit failed — a digit was misread.
                        speak(b.note.ifBlank { "Those digits aren't a valid product barcode — a digit was probably misread. Try scanning it again." }, thenListen = listeningLoopActive)
                        return@launch
                    }
                    // 3. Whole-web search for the number itself, last resort.
                    val web = searchBarcodeOnWeb(digits)
                    if (web != null) {
                        speak("I found this on the web for that barcode: $web", thenListen = false)
                        search(digits)
                        return@launch
                    }
                    // Nothing found anywhere: honest answer + digits + teach offer.
                    _state.update { it.copy(lastUnknownBarcode = digits) }
                    speak(
                        "I don't know what this barcode is — it's not in any of the free product databases I can check. " +
                            "The number is ${readableDigits(digits)}. " +
                            "If you know what it is, say: this barcode is, and then the name, and I'll remember it on this phone.",
                        thenListen = listeningLoopActive,
                    )
                }
                is AinShopApi.Result.Err -> speak("I couldn't look up that barcode just now.", thenListen = listeningLoopActive)
            }
        }
    }

    /** Last resort for an unknown barcode: search the whole web for the
     *  number itself. Returns a spoken line, or null when the web says
     *  nothing useful. */
    private suspend fun searchBarcodeOnWeb(digits: String): String? {
        val request = SearchRequest(query = digits, country = "US", currency = "USD")
        return when (val result = withTimeoutOrNull(15_000L) { AinShopApi.search(request) }) {
            is AinShopApi.Result.Ok -> {
                result.value.products
                    .firstOrNull { it.title.isNotBlank() && !it.title.equals(digits, ignoreCase = true) }
                    ?.let { "${it.title} at ${it.store}" }
            }
            else -> null
        }
    }

    /** "This barcode is oat milk" — remember it on this phone, then ask
     *  whether to share it. User-taught facts are shared only after a
     *  voice yes. */
    private fun teachBarcode(name: String) {
        val code = _state.value.lastUnknownBarcode
        if (code.isNullOrBlank()) {
            speak("There's no unknown barcode to teach right now. Scan one first, and if I don't know it, tell me what it is.", thenListen = listeningLoopActive)
            return
        }
        viewModelScope.launch {
            store.teachBarcode(code, name)
            _state.update { it.copy(lastUnknownBarcode = null) }
            val entry = SharedMemoryEntry(
                key = "barcode:${code.filter { it.isDigit() }}", name = name,
                barcode = code.filter { it.isDigit() }, origin = "user",
            )
            val question = "Shall I share that $code is $name with other shoppers, so they find it instantly?"
            conversation.askConfirm(ConfirmRequest(ConfirmKind.SHARE, question, payload = gson.toJson(entry)))
            _state.update { it.copy(pendingQuestion = question) }
            speak("Got it — $code is $name. I'll remember that on this phone. $question", thenListen = true)
        }
    }

    /** Digits spaced out so text-to-speech reads them one by one. */
    private fun readableDigits(code: String): String =
        code.map { it.toString() }.joinToString(" ")

    /** "Take it" — ask the camera screen to take the photo now. */
    fun requestPhotoCapture() {
        _state.update { it.copy(photoRequest = it.photoRequest + 1) }
    }

    /** Open the camera "what is this?" screen. mode is "barcode" when the
     *  photo is a barcode fallback (the vision prompt reads digits then). */
    fun openIdentify(mode: String? = null) {
        _state.update { it.copy(screen = AppScreen.IDENTIFY, identifyMode = mode) }
    }

    /** Remove one item from the shopping list (from the Lists screen). */
    fun removeFromList(item: ListItem) {
        viewModelScope.launch {
            store.removeFromList(item.url.ifEmpty { item.title })
            speak("Removed ${item.title} from your list.", thenListen = listeningLoopActive)
        }
    }

    /** Stop watching one item for it coming back in stock. */
    fun removeStockWatch(item: StockWatch) {
        viewModelScope.launch {
            store.removeStockWatch(item.url.ifEmpty { item.title })
            speak("Stopped watching ${item.title}.", thenListen = listeningLoopActive)
        }
    }

    /** Stop watching one item's price. */
    fun removeWatch(item: WatchItem) {
        viewModelScope.launch {
            store.removeWatch(item.url.ifEmpty { item.title })
            speak("Stopped watching ${item.title}.", thenListen = listeningLoopActive)
        }
    }

    // ---- favorite stores: checked first in every search ----

    fun addFavorite(storeName: String) {
        viewModelScope.launch {
            val added = store.addFavorite(storeName)
            speak(
                if (added) "$storeName is now one of your favorite stores. I'll check it first."
                else "You already have ten favorite stores — remove one first.",
                thenListen = listeningLoopActive,
            )
        }
    }

    fun removeFavorite(storeName: String) {
        viewModelScope.launch {
            store.removeFavorite(storeName)
            speak("$storeName is no longer one of your favorites.", thenListen = listeningLoopActive)
        }
    }

    private fun listFavorites() {
        val favs = _state.value.favorites
        speak(
            if (favs.isEmpty()) "You have no favorite stores yet. Say a store's name and I'll add it."
            else "Your favorite stores: ${favs.joinToString(", ")}.",
            thenListen = listeningLoopActive,
        )
    }

    /** A photo → what it is. The photo is not stored anywhere. */
    fun identifyPhoto(imageDataUrl: String, mode: String? = null) {
        viewModelScope.launch {
            when (val result = AinShopApi.identify(imageDataUrl, _state.value.language, mode)) {
                is AinShopApi.Result.Ok -> {
                    val r = result.value
                    if (!r.identified) {
                        speak("I couldn't tell what that is from the photo. Try again with more light, or closer.", thenListen = listeningLoopActive)
                        return@launch
                    }
                    val parts = ArrayList<String>()
                    if (r.description.isNotBlank()) parts.add(r.description)
                    if (r.brand.isNotBlank()) parts.add("Brand: ${r.brand}.")
                    if (r.product.isNotBlank()) parts.add(r.product)
                    if (r.modelOrSize.isNotBlank()) parts.add(r.modelOrSize)
                    if (r.color.isNotBlank()) parts.add("Colour: ${r.color}.")
                    if (r.tip.isNotBlank()) parts.add(r.tip)
                    // An impression, not a certainty: the vision model
                    // describes only what is visible and never guesses a
                    // brand, size or price. Low confidence is said as such.
                    val spoken = when (r.confidence) {
                        "high" -> parts.joinToString(" ")
                        "medium" -> "From the picture, it looks like " + parts.joinToString(" ").replaceFirstChar { it.lowercaseChar() }
                        else -> "From the picture, it looks like " + parts.joinToString(" ").replaceFirstChar { it.lowercaseChar() } + " I'm not sure, though — try a clearer photo if you want me to look again."
                    }
                    speak(spoken, thenListen = false)
                    // Remember what the photo showed (facts only — the
                    // photo itself is never sent or stored) for the next
                    // person who asks about this item.
                    rememberEntryToMemory(SharedMemoryEntry.Companion.fromPhoto(r), "photo")
                    if (r.barcode.isNotBlank()) onBarcodeRead(r.barcode, "EAN_13")
                    else if (r.searchQuery.isNotBlank()) search(r.searchQuery)
                }
                is AinShopApi.Result.Err -> speak("I couldn't read that photo just now.", thenListen = listeningLoopActive)
            }
        }
    }

    // ---- picture-in-picture: keep talking in a small window ----

    fun enterMiniWindow() {
        _events.tryEmit(UiEvent.EnterPip)
        speak("Small window. I'll keep talking while you use other apps.", thenListen = false)
    }

    fun exitMiniWindow() {
        _events.tryEmit(UiEvent.ExitPip)
    }

    /** Called by MainActivity when the PiP state changes. Voice keeps
     *  going in the small window — shopping continues by voice there. */
    fun onPipChanged(inPip: Boolean) {
        _state.update { it.copy(inPip = inPip) }
        if (inPip && listeningLoopActive && !_state.value.isListening && !_state.value.isSpeaking) {
            listenOnce()
        }
    }

    // ---- phone calls: pause the voice, resume where it left off ----

    private fun pauseForCall() {
        wasHandsFreeBeforeCall = listeningLoopActive
        speech.stopSpeaking()
        speech.stopListening()
        saveSessionSnapshot()
        // The call takes over. Nothing is spoken — the shopper is on the phone.
    }

    private fun resumeAfterCall() {
        if (!wasHandsFreeBeforeCall) return
        wasHandsFreeBeforeCall = false
        val q = _state.value.query
        if (q.isNotBlank()) {
            speak("Welcome back — you were looking at $q.", thenListen = true)
        } else {
            speak("Welcome back. What are you looking for?", thenListen = true)
        }
    }

    private fun saveSessionSnapshot() {
        val snap = conversation.toSnapshot() ?: return
        viewModelScope.launch { store.saveLastSession(gson.toJson(snap)) }
    }

    // ---- location: asked once, only ZIP/town saved ----

    fun onLocationPermissionResult(granted: Boolean) {
        if (granted) fetchPhoneLocation()
        else speak("That's fine — you can type your ZIP in settings instead.", thenListen = listeningLoopActive)
    }

    @SuppressLint("MissingPermission")
    fun fetchPhoneLocation() {
        val context = getApplication<Application>()
        val fine = androidx.core.content.ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val coarse = androidx.core.content.ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            _events.tryEmit(UiEvent.RequestLocationPermission)
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val manager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as android.location.LocationManager
                val providers = listOf(
                    android.location.LocationManager.GPS_PROVIDER,
                    android.location.LocationManager.NETWORK_PROVIDER,
                )
                val location = providers.firstNotNullOfOrNull { provider ->
                    runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
                }
                if (location == null) {
                    withContext(Dispatchers.Main) {
                        speak("I couldn't work out where you are. Type your ZIP in settings instead.", thenListen = listeningLoopActive)
                    }
                    return@launch
                }
                val geocoder = android.location.Geocoder(context, java.util.Locale.getDefault())
                val addresses = runCatching { geocoder.getFromLocation(location.latitude, location.longitude, 1) }.getOrNull()
                val address = addresses?.firstOrNull()
                val place = SavedPlace(
                    zip = address?.postalCode ?: "",
                    city = address?.locality ?: address?.subAdminArea ?: "",
                    region = address?.adminArea ?: "",
                    country = address?.countryCode ?: "US",
                    how = "phone",
                )
                store.savePlace(place)
                withContext(Dispatchers.Main) {
                    val label = listOf(place.city, place.zip).filter { it.isNotBlank() }.joinToString(" ")
                    speak(
                        if (label.isNotBlank()) "Your place is saved as $label. I only keep the ZIP and town — nothing exact."
                        else "Your place is saved. I only keep the ZIP and town — nothing exact.",
                        thenListen = listeningLoopActive,
                    )
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    speak("I couldn't work out where you are. Type your ZIP in settings instead.", thenListen = listeningLoopActive)
                }
            }
        }
    }

    fun savePlace(zip: String, city: String, country: String = "US") {
        viewModelScope.launch {
            store.savePlace(SavedPlace(zip = zip.trim(), city = city.trim(), country = country, how = "typed"))
            speak("Your place is saved as ${listOf(city.trim(), zip.trim()).filter { it.isNotBlank() }.joinToString(" ")}.", thenListen = listeningLoopActive)
        }
    }

    fun forgetPlace() = askConfirmDelete("forget-location", "Shall I forget your saved place?")

    fun clearAllData() = askConfirmDelete("delete-all", "This deletes everything on this phone — your list, watched items and history. Are you sure?")

    // ---- owner usage page: counts only, behind the owner PIN ----

    private fun openOwner() {
        _state.update { it.copy(screen = AppScreen.OWNER) }
        if (_state.value.ownerUnlocked) {
            refreshOwnerUsage()
        } else {
            speak("Owner page. Enter your PIN — the same one as the website's owner page.", thenListen = listeningLoopActive)
        }
    }

    /** Unlock the owner page with the PIN. The PIN is never stored — only
     *  the session cookie the server returns is kept. */
    fun ownerLogin(pin: String) {
        if (!Regex("^\\d{6,12}$").matches(pin)) {
            _state.update { it.copy(ownerError = "A PIN is 6 to 12 digits.") }
            speak("A PIN is 6 to 12 digits.", thenListen = listeningLoopActive)
            return
        }
        _state.update { it.copy(ownerLoading = true, ownerError = null) }
        viewModelScope.launch {
            when (val result = ownerApi.login(pin)) {
                is OwnerApi.LoginResult.Ok -> {
                    _state.update { it.copy(ownerLoading = false, ownerUnlocked = true, ownerTriesLeft = null) }
                    refreshOwnerUsage()
                    speak("You're in. Loading the numbers.", thenListen = false)
                }
                is OwnerApi.LoginResult.WrongPin -> {
                    _state.update { it.copy(ownerLoading = false, ownerTriesLeft = result.triesLeft) }
                    speak(
                        "Wrong PIN." + (result.triesLeft?.let { " $it tries left." } ?: "") +
                            " If you never set one, set it on the website's owner page first.",
                        thenListen = listeningLoopActive,
                    )
                }
                is OwnerApi.LoginResult.Locked -> {
                    _state.update { it.copy(ownerLoading = false, ownerError = result.message) }
                    speak(result.message, thenListen = listeningLoopActive)
                }
                is OwnerApi.LoginResult.Err -> {
                    _state.update { it.copy(ownerLoading = false, ownerError = "Couldn't reach the server just now.") }
                    speak("I couldn't reach the server just now.", thenListen = listeningLoopActive)
                }
            }
        }
    }

    fun refreshOwnerUsage() {
        _state.update { it.copy(ownerLoading = true, ownerError = null) }
        viewModelScope.launch {
            when (val result = ownerApi.usage()) {
                is OwnerApi.UsageResult.Ok -> {
                    _state.update { it.copy(ownerLoading = false, ownerUsage = result.value, ownerUnlocked = true) }
                }
                is OwnerApi.UsageResult.LoginRequired -> {
                    _state.update { it.copy(ownerLoading = false, ownerUnlocked = false, ownerUsage = null) }
                    speak("Your owner session expired. Enter the PIN again.", thenListen = listeningLoopActive)
                }
                is OwnerApi.UsageResult.Err -> {
                    _state.update { it.copy(ownerLoading = false, ownerError = "Couldn't reach the server just now.") }
                    speak("I couldn't reach the server just now.", thenListen = listeningLoopActive)
                }
            }
        }
    }

    fun ownerLogout() {
        viewModelScope.launch {
            ownerApi.logout()
            _state.update { it.copy(ownerUnlocked = false, ownerUsage = null, screen = AppScreen.SETTINGS) }
            speak("Signed out of the owner page.", thenListen = listeningLoopActive)
        }
    }

    /** Speak the numbers aloud — counts only, never who. Anything the
     *  server doesn't count yet is said as "not counted yet", never
     *  invented. */
    fun speakOwnerNumbers() {
        val usage = _state.value.ownerUsage
        if (!_state.value.ownerUnlocked || usage == null) {
            speak("Open the owner page and enter your PIN first.", thenListen = listeningLoopActive)
            return
        }
        val v = usage.visitors
        val today = usage.days.firstOrNull()
        val out = StringBuilder()
        if (v != null) {
            out.append("Today: ${v.today} visitors — ${v.todayNew} new, ${v.todayReturning} returning. ")
            out.append("Last 7 days: ${v.week} different visitors. All time: ${v.allTime}. ")
            if (v.byPlatform.isNotEmpty()) {
                val parts = v.byPlatform.entries.map { (platform, count) ->
                    val label = when (platform.lowercase()) {
                        "iphone" -> "iPhone"; "android" -> "Android"
                        "computer" -> "web"; else -> platform
                    }
                    "$count on $label"
                }
                out.append("By device, last 14 days: ${parts.joinToString(", ")}. ")
            }
        }
        if (today != null) {
            out.append("Searches today: ${today.searches}. ")
        }
        val weekSearches = usage.days.sumOf { it.searches }
        if (usage.days.isNotEmpty()) out.append("Searches in the last ${usage.days.size} days: $weekSearches. ")
        // What the server doesn't count yet — said plainly, never invented.
        val missing = ArrayList<String>()
        if (usage.days.all { it.barcodeScans == null }) missing.add("barcode scans per day")
        if (usage.days.all { it.mostSearched.isEmpty() }) missing.add("most-searched items")
        if (usage.days.all { it.mostTappedBuy.isEmpty() }) missing.add("most-tapped buy buttons")
        if (v == null || v.byLang.isEmpty()) missing.add("language breakdown")
        if (missing.isNotEmpty()) {
            out.append("The server doesn't count ${missing.joinToString(", ")} yet, so I have no numbers for those. ")
        } else {
            usage.days.firstOrNull { it.barcodeScans != null }?.let {
                out.append("Barcode scans today: ${it.barcodeScans}. ")
            }
        }
        out.append("That's counts only — never who. ")
        speak(out.toString().trim(), thenListen = listeningLoopActive)
    }

    override fun onCleared() {
        super.onCleared()
        speech.shutdown()
        callHandler.stop()
        searchScope.cancel()
    }
}
