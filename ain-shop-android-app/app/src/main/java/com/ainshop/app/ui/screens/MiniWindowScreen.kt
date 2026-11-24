package com.ainshop.app.ui.screens

import androidx.compose.foundation.layout.*
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
import com.ainshop.app.ui.components.TalkButton

// AIN Shop — the picture-in-picture mini window, like YouTube.
// The app keeps talking in this small floating window while the
// shopper opens other apps. Shopping continues by voice here; a tap
// on the window (or the Full screen button) returns to full screen.

@Composable
fun MiniWindowScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp)
            .semantics { contentDescription = "AIN Shop mini window" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("AIN Shop — mini window", style = MaterialTheme.typography.titleMedium)
        Text(
            if (state.query.isNotBlank()) "Looking at: ${state.query}" else "Listening…",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (state.lastSpoken.isNotBlank()) {
            Text(
                state.lastSpoken,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
            )
        }
        TalkButton(
            isListening = state.isListening,
            isSpeaking = state.isSpeaking,
            handsFree = state.handsFree,
            onTalk = { viewModel.startHandsFree() },
            onStop = { viewModel.stopHandsFree(); viewModel.stopSpeaking() },
        )
        BigButton("Full screen", onClick = { viewModel.exitMiniWindow() }, secondary = true)
    }
}
