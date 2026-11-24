package com.ainshop.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.components.BigButton
import com.ainshop.app.ui.components.SpokenText

// AIN Shop — the owner usage page. Counts only, never who: visitors
// per day (new vs returning), searches per day, platform counts. The
// server does not count barcode scans per day, most-searched items,
// most-tapped buy buttons or a language breakdown yet — those lines
// say so plainly instead of inventing a number.
//
// Owner-only, behind the same PIN as the website's /admin page
// (POST /api/owner/login). The PIN is never stored on the phone — only
// the 30-day session cookie is kept. Everything here can be heard:
// "Read the numbers aloud" speaks the whole page.

@Composable
fun OwnerScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "Owner usage page" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Owner usage", style = MaterialTheme.typography.displayLarge)
        Text(
            "Counts only — never who. No names, no personal data, never what one person bought.",
            style = MaterialTheme.typography.bodyLarge,
        )

        if (!state.ownerUnlocked) {
            OwnerPinGate(viewModel)
            return
        }

        BigButton("Read the numbers aloud", onClick = { viewModel.speakOwnerNumbers() })
        BigButton("Refresh", onClick = { viewModel.refreshOwnerUsage() }, secondary = true)
        if (state.ownerLoading) {
            CircularProgressIndicator()
        }
        state.ownerError?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error) }

        val usage = state.ownerUsage
        if (usage != null) {
            val v = usage.visitors
            if (v != null) {
                Text("Visitors today", style = MaterialTheme.typography.titleMedium)
                Text(
                    "${v.today} visitors — ${v.todayNew} new, ${v.todayReturning} returning.",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text("Last 7 days: ${v.week} different visitors.", style = MaterialTheme.typography.bodyLarge)
                Text("All time: ${v.allTime} different visitors.", style = MaterialTheme.typography.bodyLarge)
                Text("Visitors per day (14 days)", style = MaterialTheme.typography.titleMedium)
                v.byDay.forEach { day ->
                    Text(
                        "${day.day}: ${day.devices} visitors (${day.newDevices} new, ${day.returning} returning)",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Text("By device (last 14 days)", style = MaterialTheme.typography.titleMedium)
                if (v.byPlatform.isEmpty()) {
                    Text("No device counts yet.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    v.byPlatform.forEach { (platform, count) ->
                        val label = when (platform.lowercase()) {
                            "iphone" -> "iPhone"; "android" -> "Android"
                            "computer" -> "Web"; else -> platform
                        }
                        Text("$label: $count", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            Text("Searches per day (7 days)", style = MaterialTheme.typography.titleMedium)
            if (usage.days.isEmpty()) {
                Text("No search counts yet.", style = MaterialTheme.typography.bodyMedium)
            } else {
                usage.days.forEach { day ->
                    Text("${day.day}: ${day.searches} searches", style = MaterialTheme.typography.bodyLarge)
                }
                Text(
                    "Total in the last ${usage.days.size} days: ${usage.days.sumOf { it.searches }} searches.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            Text("Not counted yet", style = MaterialTheme.typography.titleMedium)
            Text(
                "The server doesn't count these yet, so there are no numbers to show — " +
                    "say \"read the numbers\" and I'll say the same: " +
                    "barcode scans per day, most-searched items, most-tapped buy buttons, " +
                    "and a language breakdown.",
                style = MaterialTheme.typography.bodyMedium,
            )
            usage.days.firstOrNull { it.barcodeScans != null }?.let {
                Text("Barcode scans today: ${it.barcodeScans}.", style = MaterialTheme.typography.bodyLarge)
            }
        }
        SpokenText(state.lastSpoken)
        Spacer(Modifier.height(8.dp))
        BigButton("Sign out of the owner page", onClick = { viewModel.ownerLogout() }, secondary = true)
    }
}

@Composable
private fun OwnerPinGate(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    var pin by remember { mutableStateOf("") }
    Text(
        "Enter your owner PIN — the same one as the website's owner page. " +
            "It is never stored on this phone; only the session is kept.",
        style = MaterialTheme.typography.bodyLarge,
    )
    OutlinedTextField(
        value = pin,
        onValueChange = { value -> pin = value.filter { it.isDigit() }.take(12) },
        label = { Text("Owner PIN") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        visualTransformation = PasswordVisualTransformation(),
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Owner PIN, 6 to 12 digits" },
    )
    if (state.ownerLoading) {
        CircularProgressIndicator()
    }
    state.ownerError?.let {
        Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
    }
    state.ownerTriesLeft?.let {
        Text("Tries left: $it", style = MaterialTheme.typography.bodyLarge)
    }
    BigButton(
        text = "Unlock",
        onClick = { viewModel.ownerLogin(pin); pin = "" },
        enabled = pin.length in 6..12 && !state.ownerLoading,
    )
    Text(
        "If you never set a PIN, set it on the website's owner page first. " +
            "After 5 wrong PINs in an hour the server locks logins for an hour.",
        style = MaterialTheme.typography.bodyMedium,
    )
    SpokenText(state.lastSpoken)
}
