// AIN Shop — the web view that shows the website.
//
// Rules this file follows:
//  1. Only our own site loads inside the app. Anything else (a store
//     page, an email link) opens outside the app, in Safari or Mail.
//     Buying always happens on the store's own page, never inside here.
//  2. The site may use the microphone (voice shopping, OpenAI Realtime
//     over WebRTC) and the camera (barcode scan, "what is this?").
//     That permission is granted only to our own site, never to others.
//  3. Audio may play without a tap, so the voice can answer. Video
//     stays inline and never jumps to fullscreen on its own.
//  4. If the web page crashes, the site is reloaded automatically.
import SwiftUI
import WebKit
import UIKit
import AVFoundation

struct AINShopWebView: UIViewRepresentable {
    /// The live site. This is the app — the wrapper adds nothing else.
    /// The address is the shared config's site_url
    /// (ain-shop-shared/config.json). If the address ever changes, change
    /// it there first, then this one line. Every website update reaches
    /// the iPhone app on the next deploy — no wrapper rebuild needed.
    static let siteHost = "ain-shop.natimedwed.workers.dev"
    static let siteURL = URL(string: "https://ain-shop.natimedwed.workers.dev/")!

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // The voice must be able to speak without the user tapping first.
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        // Deliberately NOT set: limitsNavigationsToAppBoundDomains.
        // That would trap store pages inside the app; they must open
        // in Safari instead (see the navigation delegate below).
        // Picture-in-picture for the web content's video (on by default
        // since iOS 9; set explicitly so it survives future defaults).
        // Honest limit: this covers video PiP, not a floating window
        // over other apps for web audio — the voice keeps going through
        // background audio (see the audio session below).
        config.allowsPictureInPictureMediaPlayback = true
        // The page must be able to tell it is inside the app wrapper,
        // so it keeps the voice going in the background instead of
        // pausing when the app is hidden (see callpause.js).
        config.applicationNameForUserAgent = "AINShopiOS/1.0"

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.bounces = false
        webView.backgroundColor = .black
        webView.isOpaque = true
        // Background audio: the voice keeps playing when the user
        // switches apps, and a phone call interrupts it cleanly.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
        } catch {
            // The voice still works in the foreground; background audio
            // just will not continue. Nothing else changes.
        }
        context.coordinator.mainWebView = webView
        webView.load(URLRequest(url: Self.siteURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Nothing to update: the website drives itself.
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var mainWebView: WKWebView?
        // Popup windows from window.open() / target="_blank" are kept
        // alive here so the page's window reference stays valid.
        private var popupWebViews: [WKWebView] = []

        override init() {
            super.init()
            // A phone call (or Siri, or an alarm) interrupts the audio:
            // the page pauses the voice and resumes it when the call ends.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(audioInterrupted(_:)),
                name: AVAudioSession.interruptionNotification,
                object: nil
            )
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @objc private func audioInterrupted(_ note: Notification) {
            guard let info = note.userInfo,
                  let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
            let began = type == .began
            // The page pauses the voice on began and resumes it on ended —
            // the search and the results stay exactly where they were.
            mainWebView?.evaluateJavaScript(
                "window.BAIN_CALLPAUSE && BAIN_CALLPAUSE.onInterruption(\(began))",
                completionHandler: nil
            )
        }

        // MARK: - Navigation

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            // Email and phone links: hand them to the system (Mail, Phone).
            if let scheme = url.scheme, scheme != "http", scheme != "https" {
                if UIApplication.shared.canOpenURL(url) {
                    UIApplication.shared.open(url)
                }
                decisionHandler(.cancel)
                return
            }

            // Our own site stays inside the app.
            if url.host == AINShopWebView.siteHost {
                decisionHandler(.allow)
                return
            }

            // Anything else (a store page, any other website) opens in
            // Safari and never loads inside the app. This also catches
            // the site's own fallback: if window.open() returns nothing,
            // the site sets location.href to the store, which lands here.
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(.allow)
        }

        // target="_blank" links and window.open() come here. A store link
        // gets a throwaway web view whose navigation is caught by the
        // decidePolicy above (off-site -> Safari, exactly once). Our own
        // site's links load in the main web view instead.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }

            if url.host == AINShopWebView.siteHost {
                mainWebView?.load(URLRequest(url: url))
                return nil
            }

            let popup = WKWebView(frame: .zero, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            popupWebViews.append(popup)
            return popup
        }

        // MARK: - Microphone and camera

        // The page asks for the microphone (voice call) or the camera
        // (barcode scan, "what is this?"). Grant it only when the request
        // comes from our own site; every other site is refused.
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            if origin.host == AINShopWebView.siteHost {
                decisionHandler(.grant)
            } else {
                decisionHandler(.deny)
            }
        }

        // MARK: - JavaScript dialogs (the site rarely uses them; answer
        // them instead of letting the page wait forever).

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            completionHandler()
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            completionHandler(false)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            completionHandler(nil)
        }

        // MARK: - Recovery

        // If the web page crashes, load the site again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.load(URLRequest(url: AINShopWebView.siteURL))
        }

        // If the site cannot be reached at all (no internet), show a
        // plain message instead of a blank page. The user relaunches
        // the app to try again.
        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            let message = """
            <html><body style="background:#000;color:#fff;font-family:-apple-system;font-size:22px;padding:40px;">
            <h1>AIN Shop</h1>
            <p>The shop could not be reached. Please check your internet connection and open the app again.</p>
            </body></html>
            """
            webView.loadHTMLString(message, baseURL: AINShopWebView.siteURL)
        }
    }
}
