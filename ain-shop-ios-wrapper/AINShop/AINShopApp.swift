// AIN Shop — iPhone wrapper (own build, no Tab).
// Thin native shell around the website. All shopping logic, voice,
// search and prices live in the website; this app only shows it
// full-screen and lets it use the microphone and camera.
import SwiftUI

@main
struct AINShopApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
