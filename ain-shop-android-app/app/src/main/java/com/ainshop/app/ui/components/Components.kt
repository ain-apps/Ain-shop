package com.ainshop.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.ainshop.app.data.Product
import com.ainshop.app.util.Money

// AIN Shop — the shared pieces. Every button is at least 64dp tall
// (a big touch target), every control has a TalkBack label, and every
// screen is usable by voice alone — these pieces are the visual half of
// that promise.

/** A big button: 64dp tall, large text, TalkBack label. */
@Composable
fun BigButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    secondary: Boolean = false,
    description: String? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
            .semantics {
                contentDescription = description ?: text
                role = Role.Button
            },
        shape = RoundedCornerShape(16.dp),
        colors = if (secondary) {
            ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface,
            )
        } else ButtonDefaults.buttonColors(),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

/** The big "talk" button: shows whether the app is listening or speaking. */
@Composable
fun TalkButton(
    isListening: Boolean,
    isSpeaking: Boolean,
    handsFree: Boolean,
    onTalk: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        val label = when {
            isListening -> "Listening… tap to stop"
            isSpeaking -> "Speaking… tap to stop"
            handsFree -> "Talking with you — tap to pause"
            else -> "Tap to talk"
        }
        Button(
            onClick = { if (isListening || isSpeaking) onStop() else onTalk() },
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .semantics { contentDescription = label; role = Role.Button },
            shape = RoundedCornerShape(24.dp),
        ) {
            Text(label, style = MaterialTheme.typography.titleLarge)
        }
    }
}

/** What the app just said, in large text — the spoken answer, written. */
@Composable
fun SpokenText(text: String, modifier: Modifier = Modifier) {
    if (text.isBlank()) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(20.dp),
        )
    }
}

/** One search result: title, price, store, rating, stock, and the
 *  actions — every one of them also works by voice. */
@Composable
fun ProductCard(
    product: Product,
    index: Int,
    onHear: () -> Unit,
    onBuy: () -> Unit,
    onAddToList: () -> Unit,
    onWatch: () -> Unit,
    onReviews: () -> Unit,
    onCompare: (() -> Unit)?,
    onPriceHistory: () -> Unit,
    onCallStore: () -> Unit,
    onReturnWindow: () -> Unit,
    onWatchBackInStock: (() -> Unit)?,
    onAisle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = "${index + 1}. ${product.title}, ${Money.speak(product.price, product.currency)} at ${product.store}" },
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("${index + 1}. ${product.title}", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                Money.format(product.price, product.currency) + "  •  " + product.store,
                style = MaterialTheme.typography.titleSmall,
            )
            val rating = product.rating?.let { "$it stars" + (product.reviews?.let { r -> " from $r reviews" } ?: "") }
            val stock = when (product.inStock) { true -> "In stock"; false -> "Out of stock"; null -> null }
            val bits = listOfNotNull(rating, stock, product.delivery?.takeIf { it.isNotBlank() })
            if (bits.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(bits.joinToString("  •  "), style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onHear,
                    modifier = Modifier.weight(1f).height(56.dp)
                        .semantics { contentDescription = "Hear ${product.title} in detail" },
                ) { Text("Hear it") }
                Button(
                    onClick = onBuy,
                    modifier = Modifier.weight(1f).height(56.dp)
                        .semantics { contentDescription = "Buy ${product.title} at ${product.store}" },
                ) { Text("Buy at ${product.store}") }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onAddToList,
                    modifier = Modifier.weight(1f).height(56.dp)
                        .semantics { contentDescription = "Add ${product.title} to my list" },
                ) { Text("Save to list") }
                OutlinedButton(
                    onClick = onWatch,
                    modifier = Modifier.weight(1f).height(56.dp)
                        .semantics { contentDescription = "Watch the price of ${product.title}" },
                ) { Text("Watch price") }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onReviews, modifier = Modifier.weight(1f).height(48.dp)) { Text("Reviews") }
                TextButton(onClick = onPriceHistory, modifier = Modifier.weight(1f).height(48.dp)) { Text("Was it cheaper?") }
                TextButton(onClick = onCallStore, modifier = Modifier.weight(1f).height(48.dp)) { Text("Call store") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (onCompare != null) {
                    TextButton(onClick = onCompare, modifier = Modifier.weight(1f).height(48.dp)) { Text("Compare") }
                }
                TextButton(onClick = onReturnWindow, modifier = Modifier.weight(1f).height(48.dp)) { Text("Return window") }
                if (onWatchBackInStock != null) {
                    TextButton(onClick = onWatchBackInStock, modifier = Modifier.weight(1f).height(48.dp)) { Text("Tell me when back") }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onAisle,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                        .semantics { contentDescription = "Where is ${product.title} in the store" },
                ) { Text("Where is it in the store?") }
            }
        }
    }
}

/** A row in a list screen (shopping list, watchlist, history). */
@Composable
fun ListRow(
    title: String,
    subtitle: String?,
    actionLabel: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium)
                }
            }
            TextButton(onClick = onAction, modifier = Modifier.height(48.dp)) { Text(actionLabel) }
        }
    }
}
