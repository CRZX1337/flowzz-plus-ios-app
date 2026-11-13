import SafariServices

/// flowzz+ uses browser APIs directly and does not require native messaging.
/// Complete unexpected native requests without echoing or persisting their data.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
