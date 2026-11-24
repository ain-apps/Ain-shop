// AIN Shop — native Android app (Kotlin + Jetpack Compose).
// NOT a WebView wrapper: every screen is built natively in Compose.
// The website code (../ain-shop-android-test/site/) is the reference for
// features, voice commands and API shapes — it is never loaded here.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ain-shop"
include(":app")
