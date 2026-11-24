package com.ainshop.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.ainshop.app.data.Languages
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.components.BigButton
import com.ainshop.app.voice.VoiceAction

// AIN Shop — settings. Language (50), speech speed, the saved place
// (ZIP/town only), clothing sizes (on the phone only), shared memory
// on or off, the daily price-drop roundup, and deleting everything.
// Every setting is also changeable by voice; this screen is the
// visual half.

@Composable
fun SettingsScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "Settings" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.displayLarge)

        Text("Language", style = MaterialTheme.typography.titleMedium)
        Text(
            "Now: ${Languages.ALL.firstOrNull { it.code == state.language }?.englishName ?: state.language}. Say \"change language to Spanish\" or pick one.",
            style = MaterialTheme.typography.bodyMedium,
        )
        LanguagePicker(
            current = state.language,
            onPick = { viewModel.setLanguageByName(it) },
        )

        Text("Speech speed", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                com.ainshop.app.data.ResponseSpeed.FAST to "Fast",
                com.ainshop.app.data.ResponseSpeed.NORMAL to "Normal",
                com.ainshop.app.data.ResponseSpeed.SLOW to "Slow",
            ).forEach { (value, label) ->
                BigButton(
                    text = label,
                    onClick = { viewModel.dispatch(VoiceAction.SetSpeed(value.name.lowercase())) },
                    secondary = state.speed != value,
                )
            }
        }

        Text("Your place", style = MaterialTheme.typography.titleMedium)
        PlaceEditor(viewModel)

        Text("My sizes", style = MaterialTheme.typography.titleMedium)
        Text(
            "Saved on this phone only. Say \"my shirt size is large\" any time to change one.",
            style = MaterialTheme.typography.bodyMedium,
        )
        SizeEditor(viewModel)

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Shared memory", style = MaterialTheme.typography.titleMedium)
            Switch(
                checked = state.shareMemoryEnabled,
                onCheckedChange = { viewModel.setShareMemoryEnabled(it) },
                modifier = Modifier.semantics { contentDescription = "Shared memory, ${if (state.shareMemoryEnabled) "on" else "off"}" },
            )
        }
        Text(
            "On: answers about items other people have taught come back instantly, " +
                "and your confirmed facts can help the next person. Off: only your phone's own memory. " +
                "Only item facts are ever shared — never sizes, lists, purchases, location or names — " +
                "and only after you confirm each one.",
            style = MaterialTheme.typography.bodyMedium,
        )

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Daily price-drop roundup", style = MaterialTheme.typography.titleMedium)
            Switch(
                checked = state.roundupEnabled,
                onCheckedChange = { viewModel.setRoundupEnabled(it) },
                modifier = Modifier.semantics { contentDescription = "Daily price drop roundup, ${if (state.roundupEnabled) "on" else "off"}" },
            )
        }
        Text(
            "On: once a day the app reads out any price drops on your list.",
            style = MaterialTheme.typography.bodyMedium,
        )

        Text("Owner", style = MaterialTheme.typography.titleMedium)
        BigButton("Owner numbers", onClick = { viewModel.dispatch(VoiceAction.Owner) }, secondary = true)

        Text("Your data", style = MaterialTheme.typography.titleMedium)
        BigButton("Forget my place", onClick = { viewModel.forgetPlace() }, secondary = true)
        BigButton("Delete everything on this phone", onClick = { viewModel.clearAllData() }, secondary = true)

        Text(
            "AIN Shop 1.0.1. Voice-only shopping, for the blind. " +
                "Buying opens the store's own page — AIN Shop never sees your card.",
            style = MaterialTheme.typography.bodyMedium,
        )
        BigButton("Back home", onClick = { viewModel.dispatch(VoiceAction.GoBack) }, secondary = true)
    }
}

@Composable
private fun LanguagePicker(current: String, onPick: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        BigButton(
            text = "Change language",
            onClick = { expanded = true },
            secondary = true,
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LazyColumn(Modifier.heightIn(max = 320.dp)) {
                items(Languages.ALL) { language ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                language.name +
                                    if (language.englishName != language.name) " (${language.englishName})" else "" +
                                    if (language.code == current) " — now" else ""
                            )
                        },
                        onClick = { onPick(language.name); expanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun PlaceEditor(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    var zip by remember { mutableStateOf(state.place?.zip ?: "") }
    var city by remember { mutableStateOf(state.place?.city ?: "") }
    OutlinedTextField(
        value = zip,
        onValueChange = { zip = it },
        label = { Text("ZIP code") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = city,
        onValueChange = { city = it },
        label = { Text("Town or city") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    BigButton(
        text = "Save my place",
        onClick = { viewModel.savePlace(zip.trim(), city.trim()) },
        secondary = true,
    )
    BigButton(
        text = "Use my phone's location",
        onClick = { viewModel.fetchPhoneLocation() },
        secondary = true,
    )
}

@Composable
private fun SizeEditor(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    var shirt by remember { mutableStateOf(state.sizes?.shirt ?: "") }
    var pants by remember { mutableStateOf(state.sizes?.pantsWaist ?: "") }
    var shoe by remember { mutableStateOf(state.sizes?.shoe ?: "") }
    OutlinedTextField(
        value = shirt,
        onValueChange = { shirt = it },
        label = { Text("Shirt size (e.g. Large)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = pants,
        onValueChange = { pants = it },
        label = { Text("Pants waist (e.g. 34)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = shoe,
        onValueChange = { shoe = it },
        label = { Text("Shoe size (e.g. 10)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    BigButton(
        text = "Save my sizes",
        onClick = {
            if (shirt.isNotBlank()) viewModel.dispatch(VoiceAction.SetSize("shirt", shirt.trim()))
            if (pants.isNotBlank()) viewModel.dispatch(VoiceAction.SetSize("pants", pants.trim()))
            if (shoe.isNotBlank()) viewModel.dispatch(VoiceAction.SetSize("shoes", shoe.trim()))
        },
        secondary = true,
    )
}
