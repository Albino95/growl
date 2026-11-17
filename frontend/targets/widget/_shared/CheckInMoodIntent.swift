// Shared by the widget extension AND the main app (see GrowWidgetShared.swift).
// An intent with `openAppWhenRun = true` must be compiled into the app target,
// otherwise iOS can't find it when the widget button is tapped.

import AppIntents
import Foundation
import WidgetKit

/// Tapping a mood on the widget: no network from here (auth lives in the app).
/// We write the tapped mood + an optimistic "Checking in…" state into the App
/// Group, reload the widget and bring the app forward. The app then reads
/// `grow.widget.pendingCheckin` (a `growl://checkin?mood=<key>` URL) and runs
/// the real check-in — the same handler as the URL scheme.
///
/// Why not `OpenURLIntent`: it is iOS 18+, and this widget supports iOS 17.
@available(iOS 17.0, *)
struct CheckInMoodIntent: AppIntent {
  static let title: LocalizedStringResource = "Check in"
  static let description = IntentDescription("Check in on Grow! with how today feels.")
  static let openAppWhenRun: Bool = true
  static let isDiscoverable: Bool = false

  @Parameter(title: "Mood")
  var mood: String

  init() {
    self.mood = GrowMood.okay.rawValue
  }

  init(mood: String) {
    self.mood = mood
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    if let m = GrowMood(rawValue: mood) {
      GrowPendingCheckin.record(mood: m)
    }
    return .result()
  }
}
