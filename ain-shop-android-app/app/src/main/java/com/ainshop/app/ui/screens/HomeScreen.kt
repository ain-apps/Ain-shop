package com.ainshop.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.components.BigButton
import com.ainshop.app.ui.components.SpokenText
import com.ainshop.app.ui.components.TalkButton
import com.ainshop.app.voice.VoiceAction

// AIN Shop — home. One big Talk button and the things a shopper does
// most. Everything here also works by voice; the buttons are the
// visual half for anyone who can see a little, and for sighted help.

@Composable
fun HomeScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "AIN Shop home" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("AIN Shop", style = MaterialTheme.typography.displayLarge)
        Text(
            "Shop by voice, for the blind. Say what you're looking for — or tap to talk.",
            style = MaterialTheme.typography.bodyLarge,
        )
        state.place?.let { place ->
            Text(
                "Your place: " + listOf(place.city, place.zip).filter { it.isNotBlank() }.joinToString(" "),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        TalkButton(
            isListening = state.isListening,
            isSpeaking = state.isSpeaking,
            handsFree = state.handsFree,
            onTalk = { viewModel.startHandsFree() },
            onStop = { viewModel.stopHandsFree(); viewModel.stopSpeaking() },
        )
        SpokenText(state.lastSpoken)
        if (state.query.isNotBlank() && state.results.isNotEmpty()) {
            BigButton(
                text = "Back to ${state.query} — ${state.totalResults} results",
                onClick = { viewModel.dispatch(VoiceAction.Search(state.query)) },
                secondary = true,
            )
        }
        BigButton("Scan a barcode", onClick = { viewModel.dispatch(VoiceAction.ScanBarcode) }, secondary = true)
        BigButton("What is this? (camera)", onClick = { viewModel.dispatch(VoiceAction.Identify) }, secondary = true)
        BigButton("Stores near me", onClick = { viewModel.dispatch(VoiceAction.StoresNearMe) }, secondary = true)
        BigButton("My list", onClick = { viewModel.dispatch(VoiceAction.MyList) }, secondary = true)
        BigButton("Check my watched prices", onClick = { viewModel.dispatch(VoiceAction.CheckWatchlist) }, secondary = true)
        BigButton("Deals at my favorite stores", onClick = { viewModel.dispatch(VoiceAction.Deals) }, secondary = true)
        BigButton("Mini window", onClick = { viewModel.dispatch(VoiceAction.MiniWindow) }, secondary = true)
        BigButton("Settings", onClick = { viewModel.dispatch(VoiceAction.Settings) }, secondary = true)
        Text(
            "Tip: say \"find men's shoes\", \"the second one\", \"buy it\", " +
                "\"add it to my list\", \"remember I'm looking for\", " +
                "\"tell me about Walmart\", or \"what do buyers say\".",
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
