// AIN Shop — native Android app module (Kotlin + Jetpack Compose).
// No WebView anywhere: every screen is native Compose.
// No API keys in this app: the server at ain-shop.natimedwed.workers.dev
// holds the OpenAI key; the app only ever sends query text.

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    // PLACEHOLDER — confirm against the Google Play listing before release.
    // The live iPhone app's bundle ID is different; the Android applicationId
    // must be the one on the Google Play listing, or Play treats this as a
    // brand-new app. See README.md ("Before release").
    namespace = "com.ainshop.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ainshop.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 102
        versionName = "1.0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Only arm64 is packaged: the sherpa-onnx Whisper AAR and the
        // on-device models target modern phones; it also keeps the APK small.
        ndk { abiFilters += "arm64-v8a" }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
        jniLibs { pickFirsts += "**/libonnxruntime.so" }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.5")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // Camera (barcode + "what is this?") — CameraX, no WebView involved.
    implementation("androidx.camera:camera-core:1.3.4")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
    // ML Kit barcode scanning — free, on-device, no key needed.
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    // ZXing — bundled fallback reader for the still photo when the phone's
    // own detector can't read the stripes. No database, no key: reading
    // stripes needs no lookup at all.
    implementation("com.google.zxing:core:3.5.2")
    // One-time coarse location, turned into a ZIP/town only.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Networking: plain OkHttp + Gson. The app talks to the AIN Shop
    // server only; it never calls OpenAI or any AI service directly.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")
    // Product photos, loaded straight from the store's image server.
    implementation("io.coil-kt:coil-compose:2.7.0")

    // On-device Whisper (backup listener for languages the phone's own
    // hearing doesn't cover). sherpa-onnx is NOT on Maven Central: the
    // AAR is vendored in app/libs/ — see app/libs/README.md and
    // scripts/fetch-sherpa-onnx.sh. The build fails with a clear message
    // if the AAR has not been fetched yet (see verifyWhisperLibs below).
    // The code in voice/WhisperFallback.kt only runs when the AAR and a
    // downloaded model are both present; otherwise the app simply
    // reports Whisper as unavailable and keeps using the phone's hearing.
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}

// Fail early with a clear instruction when a fresh clone has not fetched
// the vendored sherpa-onnx AAR yet, instead of a cryptic linker error.
tasks.register("verifyWhisperLibs") {
    val aar = layout.projectDirectory.file("libs/sherpa-onnx-1.13.3.aar").asFile
    doLast {
        if (!aar.exists()) {
            throw GradleException(
                "Missing vendored sherpa-onnx AAR for on-device Whisper.\n" +
                "Run: bash scripts/fetch-sherpa-onnx.sh\n" +
                "It downloads sherpa-onnx-1.13.3.aar from the k2-fsa/sherpa-onnx\n" +
                "GitHub release into app/libs/ (see app/libs/README.md).\n" +
                "Whisper is the backup listener only — the phone's own speech\n" +
                "recognition works without it."
            )
        }
    }
}
tasks.named("preBuild") { dependsOn("verifyWhisperLibs") }
