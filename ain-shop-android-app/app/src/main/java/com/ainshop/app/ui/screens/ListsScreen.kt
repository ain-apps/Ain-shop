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
import com.ainshop.app.ui.components.ListRow
import com.ainshop.app.voice.VoiceAction

// AIN Shop — lists. The shopping list, the watched prices (with the
// daily spoken roundup), the back-in-stock watches, and Buy again
// (things bought before, with a reorder shortcut). Everything here
// is also reachable by voice: "save that to my list", "check my
// prices", "reorder the milk".

@Composable
fun ListsScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "My lists" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("My lists", style = MaterialTheme.typography.displayLarge)

        Text("Shopping list", style = MaterialTheme.typography.titleMedium)
        if (state.shoppingList.isEmpty()) {
            Text("Nothing on your list yet. Say \"save that to my list\" after a search.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.shoppingList.forEach { item ->
                ListRow(
                    title = item.title,
                    subtitle = if (item.store.isNotBlank()) item.store else null,
                    actionLabel = "Remove ${item.title}",
                    onAction = { viewModel.removeFromList(item) },
                )
            }
        }

        Text("Watched prices", style = MaterialTheme.typography.titleMedium)
        if (state.watchlist.isEmpty()) {
            Text("Nothing watched yet. Say \"remember I'm looking for\" after a search.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.watchlist.forEach { item ->
                ListRow(
                    title = item.title,
                    subtitle = "Target: ${item.targetPrice?.let { com.ainshop.app.util.Money.format(it, item.currency) } ?: "no target"} · Last seen: ${item.lastPrice?.let { com.ainshop.app.util.Money.format(it, item.currency) } ?: "not seen"} · ${item.store}",
                    actionLabel = "Stop watching ${item.title}",
                    onAction = { viewModel.removeWatch(item) },
                )
            }
            BigButton("Check my prices now", onClick = { viewModel.checkWatchlist(true) }, secondary = true)
        }

        Text("Back in stock", style = MaterialTheme.typography.titleMedium)
        if (state.stockWatches.isEmpty()) {
            Text("Nothing watched for stock. Say \"tell me when it's back\" on an out-of-stock item.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.stockWatches.forEach { watch ->
                ListRow(
                    title = watch.title,
                    subtitle = watch.store,
                    actionLabel = "Stop watching ${watch.title}",
                    onAction = { viewModel.removeStockWatch(watch) },
                )
            }
            BigButton("Check stock now", onClick = { viewModel.checkStockWatches() }, secondary = true)
        }

        Text("Buy again", style = MaterialTheme.typography.titleMedium)
        if (state.history.isEmpty()) {
            Text("Nothing bought yet.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.history.take(10).forEach { item ->
                ListRow(
                    title = item.title,
                    subtitle = if (item.store.isNotBlank()) item.store else null,
                    actionLabel = "Reorder ${item.title}",
                    onAction = { viewModel.dispatch(VoiceAction.Reorder(item.title)) },
                )
            }
        }

        BigButton("Back home", onClick = { viewModel.dispatch(VoiceAction.GoBack) }, secondary = true)
    }
}
