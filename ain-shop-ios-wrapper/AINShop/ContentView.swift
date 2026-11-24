// AIN Shop — the one screen: the website, full-screen.
// The site is dark, so the app stays dark too.
import SwiftUI

struct ContentView: View {
    var body: some View {
        AINShopWebView()
            .ignoresSafeArea()
            .preferredColorScheme(.dark)
    }
}
