package com.ainshop.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.ainshop.app.ui.AppScreen
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.UiEvent
import com.ainshop.app.ui.pip.PipController
import com.ainshop.app.ui.screens.*
import com.ainshop.app.ui.theme.AinShopTheme
import kotlinx.coroutines.launch

// AIN Shop — the one activity. Everything on screen is Jetpack Compose
// (no WebView anywhere); the ViewModel owns what is shown and said.
// This activity only does what an activity must: permissions, intents
// from the ViewModel (browser, dialer), and picture-in-picture.

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels()
    private lateinit var pipController: PipController

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Startup permissions (microphone, camera, notifications).
           Location is asked for separately, only when the shopper
           chooses "use my location" — see locationPermissionLauncher. */ }

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        viewModel.onLocationPermissionResult(granted)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pipController = PipController(this)
        pipController.onTalk = {
            if (viewModel.state.value.handsFree) viewModel.listenOnce() else viewModel.startHandsFree()
        }
        pipController.onStop = { viewModel.stopSpeaking() }
        pipController.register()

        requestStartupPermissions()
        collectEvents()

        setContent {
            AinShopTheme {
                val state by viewModel.state.collectAsState()
                // In the small window, only the mini window shows.
                if (state.inPip) {
                    MiniWindowScreen(viewModel)
                } else {
                    when (state.screen) {
                        AppScreen.HOME -> HomeScreen(viewModel)
                        AppScreen.RESULTS -> ResultsScreen(viewModel)
                        AppScreen.BARCODE -> BarcodeScreen(viewModel)
                        AppScreen.IDENTIFY -> IdentifyScreen(viewModel)
                        AppScreen.LISTS -> ListsScreen(viewModel)
                        AppScreen.STORES -> StoresScreen(viewModel)
                        AppScreen.SETTINGS -> SettingsScreen(viewModel)
                        AppScreen.OWNER -> OwnerScreen(viewModel)
                    }
                }
            }
        }
    }

    private fun requestStartupPermissions() {
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
    }

    fun requestLocationPermission() {
        locationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
        )
    }

    private fun collectEvents() {
        lifecycleScope.launch {
            viewModel.events.collect { event ->
                when (event) {
                    is UiEvent.OpenBrowser -> {
                        // Buying opens the store's own page in the browser;
                        // AIN Shop never sees the card.
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(event.url)))
                    }
                    is UiEvent.Dial -> {
                        // The dialer opens with the number shown — the
                        // app never dials by itself.
                        startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${event.number}")))
                    }
                    is UiEvent.EnterPip -> pipController.enterPip()
                    is UiEvent.ExitPip -> {
                        // Bring the task back to the front: that is how
                        // an app in PiP returns to full screen.
                        val intent = Intent(this@MainActivity, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        }
                        startActivity(intent)
                    }
                    is UiEvent.RequestLocationPermission -> requestLocationPermission()
                    is UiEvent.ShareText -> {
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, event.text)
                        }
                        startActivity(Intent.createChooser(share, "Share"))
                    }
                }
            }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        pipController.onPipModeChanged(isInPictureInPictureMode)
        viewModel.onPipChanged(isInPictureInPictureMode)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Pressing Home during a voice session shrinks to the mini window
        // instead of stopping — the app keeps talking.
        if (viewModel.state.value.handsFree && pipController.isSupported) {
            pipController.enterPip()
        }
    }

    override fun onDestroy() {
        pipController.unregister()
        super.onDestroy()
    }
}
