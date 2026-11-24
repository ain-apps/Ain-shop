package com.ainshop.app.voice

import com.ainshop.app.data.Product

// AIN Shop — the conversation spine.
// Remembers the last search so follow-ups work like a person talking:
// "the second one", "the cheaper one", "open it", "describe it".
// Also holds the one question the app is waiting on an answer for —
// a yes/no confirmation before anything is bought, paid for or deleted.

data class SearchSnapshot(
    val query: String,
    val results: List<Product>,
    val total: Int,
    val shown: Int,
    val storeScope: String? = null,
    val place: String? = null,
    val at: Long = System.currentTimeMillis(),
)

enum class ConfirmKind { BUY, DELETE, REORDER, WATCH, ROUNDUP_CHECK, SHARE }

data class ConfirmRequest(
    val kind: ConfirmKind,
    val question: String,
    val payload: String = "",
    val index: Int = -1,
)

class ConversationManager {
    var lastSearch: SearchSnapshot? = null
        private set
    var currentIndex: Int = -1
        private set
    var pendingConfirm: ConfirmRequest? = null
        private set

    fun rememberSearch(query: String, results: List<Product>, total: Int, storeScope: String? = null, place: String? = null) {
        lastSearch = SearchSnapshot(query, results, total, shown = minOf(3, results.size), storeScope = storeScope, place = place)
        currentIndex = -1
    }

    fun rememberMore(shown: Int) {
        lastSearch = lastSearch?.copy(shown = shown)
    }

    fun choose(index: Int) {
        currentIndex = index
    }

    fun askConfirm(request: ConfirmRequest) {
        pendingConfirm = request
    }

    /** Returns the pending confirmation and clears it, or null. */
    fun takeConfirm(): ConfirmRequest? {
        val c = pendingConfirm
        pendingConfirm = null
        return c
    }

    fun clearConfirm() {
        pendingConfirm = null
    }

    fun clearSearch() {
        lastSearch = null
        currentIndex = -1
    }

    /** "The second one" etc., against the results on screen. */
    fun resolveReference(text: String): Int? {
        val results = lastSearch?.results ?: return null
        return VoiceCommands.resolveReference(text, results, currentIndex)
    }

    fun toSnapshot(): SearchSnapshot? = lastSearch

    fun restore(snapshot: SearchSnapshot) {
        lastSearch = snapshot
        currentIndex = -1
    }
}
