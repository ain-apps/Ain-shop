package com.ainshop.app.data

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

// AIN Shop — the owner API: the same PIN-protected endpoints the
// website's /admin page uses. Endpoint paths come from the shared
// contract (ain-shop-shared/api-contract.json) via the generated
// ApiEndpoints — never edit them here.
//
//   POST /api/owner/login { pin }  → sets a 30-day session cookie
//   GET  /api/owner/usage          → the usage numbers (OwnerStats)
//   POST /api/owner/logout         → clears the session
//
// The PIN is 6–12 digits. It is NEVER stored on the phone and never
// leaves except inside the login call itself, where the server checks
// it against its hash. Only the session cookie (bain_owner) is kept,
// in the phone's private storage, and it is sent back on usage calls.
// Wrong PINs are rate-limited by the server (5 tries per hour, 100 a
// day site-wide); the app shows the tries left and the lock message
// the server returns. If no PIN was ever set on the website, every
// login is a wrong PIN — the app says so and points at the website's
// owner page to set one.

class OwnerApi(private val store: LocalStore) {

    sealed class LoginResult {
        object Ok : LoginResult()
        data class WrongPin(val triesLeft: Int?) : LoginResult()
        data class Locked(val message: String) : LoginResult()
        data class Err(val error: String) : LoginResult()
    }

    sealed class UsageResult {
        data class Ok(val value: OwnerUsageResponse) : UsageResult()
        /** The session expired or was never made — ask for the PIN again. */
        object LoginRequired : UsageResult()
        data class Err(val error: String) : UsageResult()
    }

    private val json = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun login(pin: String): LoginResult = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(AinShopApi.BASE_URL + ApiEndpoints.OWNER_LOGIN)
                .post(gson.toJson(mapOf("pin" to pin)).toRequestBody(json))
                .header("X-AIN-App", "android/1.0.1")
                .build()
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                when (response.code) {
                    200 -> {
                        val cookie = response.headers("set-cookie")
                            .firstOrNull { it.startsWith("bain_owner=") }
                            ?.substringBefore(";")
                            ?.removePrefix("bain_owner=")
                        if (cookie.isNullOrBlank()) return@withContext LoginResult.Err("no_session")
                        store.saveOwnerCookie(cookie)
                        LoginResult.Ok
                    }
                    401 -> {
                        val tries = runCatching {
                            gson.fromJson(text, Map::class.java)["tries_left"] as? Double
                        }.getOrNull()?.toInt()
                        LoginResult.WrongPin(tries)
                    }
                    429 -> LoginResult.Locked("Too many wrong PINs. Try again in an hour.")
                    else -> LoginResult.Err("server")
                }
            }
        } catch (e: java.io.IOException) {
            LoginResult.Err("offline")
        } catch (e: Exception) {
            LoginResult.Err("server")
        }
    }

    suspend fun usage(): UsageResult = withContext(Dispatchers.IO) {
        val cookie = store.ownerCookieValue() ?: return@withContext UsageResult.LoginRequired
        try {
            val request = Request.Builder()
                .url(AinShopApi.BASE_URL + ApiEndpoints.OWNER_USAGE)
                .header("Cookie", "bain_owner=$cookie")
                .header("X-AIN-App", "android/1.0.1")
                .build()
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                when (response.code) {
                    200 -> {
                        val parsed = runCatching { gson.fromJson(text, OwnerUsageResponse::class.java) }.getOrNull()
                        if (parsed == null) UsageResult.Err("server") else UsageResult.Ok(parsed)
                    }
                    401 -> {
                        store.clearOwnerCookie()
                        UsageResult.LoginRequired
                    }
                    else -> UsageResult.Err("server")
                }
            }
        } catch (e: java.io.IOException) {
            UsageResult.Err("offline")
        } catch (e: Exception) {
            UsageResult.Err("server")
        }
    }

    suspend fun logout() {
        val cookie = store.ownerCookieValue()
        if (cookie != null) {
            runCatching {
                withContext(Dispatchers.IO) {
                    val request = Request.Builder()
                        .url(AinShopApi.BASE_URL + ApiEndpoints.OWNER_LOGOUT)
                        .post("{}".toRequestBody(json))
                        .header("Cookie", "bain_owner=$cookie")
                        .build()
                    client.newCall(request).execute().close()
                }
            }
        }
        store.clearOwnerCookie()
    }
}
