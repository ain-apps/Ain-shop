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

// AIN Shop — stores. Nearby stores (address, hours, pickup and
// delivery, from the store's own page — never guessed), favorite
// stores (checked first in every search), and the whole store list.
// "Tell me about Walmart" speaks everything about a store, and
// "call Walmart" dials its public number.

@Composable
fun StoresScreen(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "Stores" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Stores", style = MaterialTheme.typography.displayLarge)

        Text("Nearby", style = MaterialTheme.typography.titleMedium)
        if (state.nearbyStores.isEmpty()) {
            Text("No nearby stores loaded yet. Say \"stores near me\" and I'll look.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.nearbyStores.forEach { store ->
                Column(Modifier.fillMaxWidth()) {
                    Text(store.name, style = MaterialTheme.typography.bodyLarge)
                    store.address?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    store.hoursToday?.let { Text("Hours today: $it", style = MaterialTheme.typography.bodyMedium) }
                    Text(
                        listOfNotNull(
                            if (store.pickup == true) "Pickup" else null,
                            if (store.sameDayDelivery == true) "Same-day delivery" else null,
                        ).joinToString(" · ").ifEmpty { "Pickup and delivery not shown on the store's page." },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BigButton("Tell me about it", onClick = { viewModel.dispatch(VoiceAction.TellAboutStore(store.name)) }, secondary = true)
                        BigButton("Call", onClick = { viewModel.dispatch(VoiceAction.CallStore(store.name)) }, secondary = true)
                    }
                }
            }
        }

        Text("My favorite stores", style = MaterialTheme.typography.titleMedium)
        if (state.favorites.isEmpty()) {
            Text("No favorites yet. Say \"add Walmart to my favorites\" — I'll check them first.", style = MaterialTheme.typography.bodyMedium)
        } else {
            state.favorites.forEach { name ->
                ListRow(
                    title = name,
                    actionLabel = "Remove $name from favorites",
                    onAction = { viewModel.removeFavorite(name) },
                )
            }
        }

        Text("All stores", style = MaterialTheme.typography.titleMedium)
        com.ainshop.app.data.StoreDirectory.STORES.forEach { store ->
            ListRow(
                title = store.name,
                subtitle = store.host,
                actionLabel = "Tell me about ${store.name}",
                onAction = { viewModel.dispatch(VoiceAction.TellAboutStore(store.name)) },
            )
        }

        BigButton("Back home", onClick = { viewModel.dispatch(VoiceAction.GoBack) }, secondary = true)
    }
}
