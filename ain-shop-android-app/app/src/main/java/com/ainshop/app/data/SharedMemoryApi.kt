package com.ainshop.app.data

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// AIN Shop — the shared pure memory client.
// Talks to the same backend as everything else (it holds no key; the
// app sends item facts only, never anything personal).
//
// The endpoint paths come from the shared contract
// (ain-shop-shared/api-contract.json) via the generated ApiEndpoints.
// NOTE the drift: the server does NOT have /api/memory/lookup or
// /api/memory/teach yet — it has /api/shop/memory and
// /api/shop/memory/share. Until the paths are lined up, every call here
// gets a 404 and the app falls back to live search (see below).
//
//   GET  /api/memory/lookup?barcode=…   → { found, entry }
//   GET  /api/memory/lookup?query=…     → { found, entry }
//   POST /api/memory/teach              → { ok }   (body: the entry + origin)
//
// SERVER SIDE DOES NOT EXIST YET (checked 2026-11-20). A 404 or any
// failure is treated as "no shared memory yet": the caller falls back
// to the normal live search and the app works exactly as before. The
// feature switches itself on the day the endpoints land — no app
// update needed for the lookup path. See README.md for the contract.

object SharedMemoryApi {

    private val json = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    sealed class Result<out T> {
        data class Ok<T>(val value: T) : Result<T>()
        /** "not_available" = no shared memory on the server yet (404) or
         *  offline — the caller must fall back to live search. */
        data class Err(val error: String) : Result<Nothing>()
    }

    data class LookupResponse(
        val found: Boolean = false,
        val entry: SharedMemoryEntry? = null,
        val error: String? = null,
    )

    suspend fun lookupByBarcode(code: String): Result<SharedMemoryEntry?> =
        lookup("barcode=" + URLEncoder.encode(code.filter { it.isDigit() }, "UTF-8"))

    suspend fun lookupByQuery(query: String): Result<SharedMemoryEntry?> =
        lookup("query=" + URLEncoder.encode(query.trim(), "UTF-8"))

    private suspend fun lookup(params: String): Result<SharedMemoryEntry?> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(AinShopApi.BASE_URL + ApiEndpoints.MEMORY_LOOKUP + "?$params")
                .header("X-AIN-App", "android/1.0.1")
                .build()
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (response.code == 404) return@withContext Result.Err("not_available")
                if (!response.isSuccessful) return@withContext Result.Err("not_available")
                val parsed = runCatching { gson.fromJson(text, LookupResponse::class.java) }.getOrNull()
                    ?: return@withContext Result.Err("not_available")
                Result.Ok(if (parsed.found) parsed.entry else null)
            }
        } catch (e: Exception) {
            Result.Err("not_available")
        }
    }

    /** Remember an entry. origin is "web" (public facts from a search),
     *  "photo" (facts a photo revealed — the photo itself is never sent),
     *  or "user" (user-taught — only ever sent after the user confirmed
     *  it by voice). Returns false when the server has no memory yet. */
    suspend fun teach(entry: SharedMemoryEntry, origin: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val body = mapOf("entry" to entry, "origin" to origin)
            val request = Request.Builder()
                .url(AinShopApi.BASE_URL + ApiEndpoints.MEMORY_TEACH)
                .post(gson.toJson(body).toRequestBody(json))
                .header("X-AIN-App", "android/1.0.1")
                .build()
            client.newCall(request).execute().use { response ->
                if (response.code == 404) return@withContext Result.Err("not_available")
                if (!response.isSuccessful) return@withContext Result.Err("not_available")
                Result.Ok(true)
            }
        } catch (e: Exception) {
            Result.Err("not_available")
        }
    }
}
