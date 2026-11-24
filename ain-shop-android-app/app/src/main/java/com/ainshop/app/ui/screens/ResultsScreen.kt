package com.ainshop.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import com.ainshop.app.ui.components.ProductCard
import com.ainshop.app.ui.components.SpokenText
import com.ainshop.app.ui.components.TalkButton
import com.ainshop.app.voice.VoiceAction

// AIN Shop — search results. The top three, the total count, and more
// by voice ("next") or by the button. Every action on a card also
// works by voice: hear it, buy it, save it, watch it, reviews,
// compare, was it cheaper, call the store, return window, back in
// stock, where it sits in the store.

@Composable
fun ResultsScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text(
            if (state.query.isNotBlank()) "Results for \"${state.query}\"" else "Results",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { contentDescription = "Results for ${state.query}, ${state.totalResults} found" },
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "We found ${state.totalResults} results." +
                if (state.fromSharedMemory) " From shared memory — no search needed." else "",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (state.partial) {
            Text("Still checking the rest…", style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(8.dp))
        TalkButton(
            isListening = state.isListening,
            isSpeaking = state.isSpeaking,
            handsFree = state.handsFree,
            onTalk = { viewModel.startHandsFree() },
            onStop = { viewModel.stopHandsFree(); viewModel.stopSpeaking() },
        )
        Spacer(Modifier.height(8.dp))
        SpokenText(state.lastSpoken)
        Spacer(Modifier.height(8.dp))
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(state.results.take(state.shownCount)) { index, product ->
                ProductCard(
                    product = product,
                    index = index,
                    onHear = { viewModel.dispatch(VoiceAction.DescribeResult(index)) },
                    onBuy = { viewModel.openResultConfirmed(index) },
                    onAddToList = { viewModel.dispatch(VoiceAction.AddToList(index)) },
                    onWatch = { viewModel.dispatch(VoiceAction.RememberWatch(index, null)) },
                    onReviews = { viewModel.dispatch(VoiceAction.ReadReviews(index)) },
                    onCompare = {
                        if (state.results.size > 1) {
                            viewModel.dispatch(
                                if (index == 0) VoiceAction.Compare(0, 1)
                                else VoiceAction.Compare(0, index)
                            )
                        }
                    },
                    onPriceHistory = { viewModel.dispatch(VoiceAction.PriceHistory(index)) },
                    onCallStore = { viewModel.dispatch(VoiceAction.CallStore(product.store)) },
                    onReturnWindow = { viewModel.dispatch(VoiceAction.ReturnWindow(index)) },
                    onWatchBackInStock = if (product.inStock == false) {
                        { viewModel.dispatch(VoiceAction.BackInStockWatch(index)) }
                    } else null,
                    onAisle = { viewModel.dispatch(VoiceAction.AskAisle(index)) },
                )
            }
            if (state.shownCount < state.results.size) {
                item {
                    BigButton(
                        text = "More results (${state.results.size - state.shownCount} left)",
                        onClick = { viewModel.dispatch(VoiceAction.More) },
                    )
                }
            }
            item {
                BigButton(
                    text = "Start over",
                    onClick = { viewModel.dispatch(VoiceAction.StartOver) },
                    secondary = true,
                )
            }
        }
    }
}
