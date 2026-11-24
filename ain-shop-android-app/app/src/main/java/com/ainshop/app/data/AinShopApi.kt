package com.ainshop.app.data

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

// AIN Shop — the only network the app ever does.
// Everything goes to the AIN Shop server; the server holds the OpenAI key
// and does the searching. The app sends query text only — never a key,
// never a voice recording, never a photo that is kept anywhere.
// A search can take a while (the server checks many stores); the 15-second
// cap on the first spoken answer lives in AppViewModel, not here.
//
// The address and the endpoint paths come from the shared contract
// (ain-shop-shared/config.json + api-contract.json) via the generated
// ApiEndpoints — never edit them here; change the shared files and
// re-run tools/generate-android-api.mjs.

object AinShopApi {
    // Kept so the rest of the app keeps working unchanged; the value
    // itself lives in the generated ApiEndpoints.
    const val BASE_URL = ApiEndpoints.BASE_URL

    private val json = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(55, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    sealed class Result<out T> {
        data class Ok<T>(val value: T) : Result<T>()
        /** error is one of: offline | timeout | rate_limited | off_topic | server | not_found */
        data class Err(val error: String, val message: String = "") : Result<Nothing>()
    }

    private suspend fun <T> post(
        path: String,
        body: Any,
        parse: (String) -> T,
    ): Result<T> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(BASE_URL + path)
                .post(gson.toJson(body).toRequestBody(json))
                .header("X-AIN-App", "android/1.0.1")
                .build()
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return@withContext when (response.code) {
                        422 -> Result.Err("off_topic")
                        429 -> Result.Err("rate_limited")
                        404 -> Result.Err("not_found")
                        else -> Result.Err("server", "HTTP ${response.code}")
                    }
                }
                Result.Ok(parse(text))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Result.Err("timeout")
        } catch (e: java.io.IOException) {
            Result.Err("offline")
        } catch (e: Exception) {
            Result.Err("server", e.message ?: "")
        }
    }

    /** Whole-web product search. The fixed matching (category gate, synonym
     *  groups, wrong items removed — the 496/509-tested behavior) and the
     *  bicycle accessory rule live in the server; this app gets them free
     *  by calling the same backend as the website.
     *  NOTE: the slippers rule is deliberately NOT applied anywhere —
     *  it is still waiting for his yes/no. */
    suspend fun search(request: SearchRequest): Result<SearchResponse> =
        post(ApiEndpoints.SHOP_SEARCH, request) { gson.fromJson(it, SearchResponse::class.java) }

    /** Read one store's own site ("open Walmart"). */
    suspend fun searchStore(site: String, query: String): Result<StoreResponse> =
        post(ApiEndpoints.SHOP_STORE, mapOf("site" to site, "query" to query)) {
            gson.fromJson(it, StoreResponse::class.java)
        }

    /** What a product looks like, from its photo description. */
    suspend fun details(url: String, store: String, image: String?): Result<DetailsResponse> =
        post(ApiEndpoints.SHOP_DETAILS, mapOf("url" to url, "store" to store, "image" to (image ?: ""))) {
            gson.fromJson(it, DetailsResponse::class.java)
        }

    /** A barcode number → what the product is, from free open product
     *  databases. Never invented: found=false when it is not in them. */
    suspend fun barcode(code: String, format: String, lang: String): Result<BarcodeResponse> =
        post(ApiEndpoints.SHOP_BARCODE, mapOf("code" to code, "format" to format, "lang" to lang)) {
            gson.fromJson(it, BarcodeResponse::class.java)
        }

    /** A photo → what it is. The photo is not stored anywhere.
     *  `image` is a data URL (data:image/jpeg;base64,…).
     *  `mode` is "barcode" for the barcode photo fallback, else omitted. */
    suspend fun identify(imageDataUrl: String, lang: String, mode: String? = null): Result<IdentifyResponse> {
        val body = mutableMapOf<String, Any>("image" to imageDataUrl, "lang" to lang)
        if (mode != null) body["mode"] = mode
        return post(ApiEndpoints.SHOP_IDENTIFY, body) {
            gson.fromJson(it, IdentifyResponse::class.java)
        }
    }

    /** Stores near a saved ZIP/town. */
    suspend fun nearby(zip: String, city: String, region: String, country: String, kind: String = ""): Result<NearbyResponse> =
        post(
            ApiEndpoints.SHOP_NEARBY,
            mapOf("zip" to zip, "city" to city, "region" to region, "country" to country, "kind" to kind)
        ) { gson.fromJson(it, NearbyResponse::class.java) }

    /** Natural-language commands the on-phone parser doesn't know, in any
     *  of the 50 languages. The server interprets them; nothing is trained. */
    suspend fun interpret(text: String, lang: String): Result<IntentResponse> =
        post(ApiEndpoints.AI_INTENT, mapOf("text" to text, "lang" to lang)) {
            gson.fromJson(it, IntentResponse::class.java)
        }
}
