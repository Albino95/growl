// Shared by the Grow! Today widget extension AND the main app target
// (@bacons/apple-targets links every file in targets/widget/_shared to both).
// Keep this file free of extension-only / app-only APIs.

import Foundation
import WidgetKit

enum GrowWidget {
  static let appGroup = "group.app.growl.mobile"
  /// JSON string written by src/services/widgetSync.ts.
  static let snapshotKey = "grow.widget.today"
  /// JSON `{ "url": "growl://checkin?mood=good", "at": <epoch ms> }` written by
  /// CheckInMoodIntent; the app consumes + removes it when it comes to the front.
  static let pendingKey = "grow.widget.pendingCheckin"
  static let kind = "GrowToday"
  /// An optimistic "Checking in…" older than this is treated as failed.
  static let pendingTTL: TimeInterval = 120

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}

/// The five Today moods — mirrors CHECKIN_MOODS in src/components/recap/growthMeta.ts.
enum GrowMood: String, CaseIterable, Identifiable {
  case heavy, tired, okay, good, bright

  var id: String { rawValue }

  var emoji: String {
    switch self {
    case .heavy: return "\u{1F327}\u{FE0F}"
    case .tired: return "🌙"
    case .okay: return "🙂"
    case .good: return "😊"
    case .bright: return "⚡"
    }
  }

  var label: String {
    switch self {
    case .heavy: return "Heavy"
    case .tired: return "Tired"
    case .okay: return "Okay"
    case .good: return "Good"
    case .bright: return "Bright"
    }
  }
}

struct GrowFriend: Codable, Hashable {
  var initial: String
  var color: String
}

struct GrowWeekDay: Codable, Hashable {
  var day: String
  var status: String
}

struct GrowPending: Codable, Hashable {
  var mood: String
  /// Epoch milliseconds.
  var at: Double
}

/// Mirror of `WidgetSnapshot` in src/services/widgetSnapshot.ts. Every field is
/// optional so an older/newer app build never breaks decoding.
struct GrowSnapshot: Codable, Hashable {
  var v: Int?
  var signedIn: Bool?
  var day: String?
  var streak: Int?
  var checkedIn: Bool?
  var mood: String?
  var path: String?
  var restDay: Bool?
  var restDaysLeft: Int?
  var lifeMode: String?
  var lifeModeLabel: String?
  var week: [GrowWeekDay]?
  var friends: [GrowFriend]?
  var pending: GrowPending?
  var updatedAt: Double?

  static let placeholder = GrowSnapshot(
    v: 1, signedIn: true, day: GrowSnapshot.dayKey(Date()), streak: 12, checkedIn: false,
    mood: nil, path: nil, restDay: false, restDaysLeft: 2, lifeMode: nil, lifeModeLabel: nil,
    week: nil,
    friends: [
      GrowFriend(initial: "M", color: "#F59E0B"),
      GrowFriend(initial: "J", color: "#6366F1"),
      GrowFriend(initial: "A", color: "#EC4899"),
    ],
    pending: nil, updatedAt: nil
  )

  /// Local calendar day `YYYY-MM-DD` (same as localDayKey() in the app).
  static func dayKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  static func load() -> GrowSnapshot? {
    guard let raw = GrowWidget.defaults?.string(forKey: GrowWidget.snapshotKey),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(GrowSnapshot.self, from: data)
  }

  func save() {
    guard let data = try? JSONEncoder().encode(self),
          let raw = String(data: data, encoding: .utf8) else { return }
    GrowWidget.defaults?.set(raw, forKey: GrowWidget.snapshotKey)
  }
}

enum GrowPendingCheckin {
  /// Records the tapped mood for the app (consumed by src/services/widgetLinks.ts)
  /// and flips the snapshot to "Checking in…" so the widget answers instantly.
  static func record(mood: GrowMood, now: Date = Date()) {
    let ms = now.timeIntervalSince1970 * 1000
    let payload: [String: Any] = ["url": "growl://checkin?mood=\(mood.rawValue)", "at": ms]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let raw = String(data: data, encoding: .utf8) {
      GrowWidget.defaults?.set(raw, forKey: GrowWidget.pendingKey)
    }
    var snap = GrowSnapshot.load() ?? GrowSnapshot()
    snap.pending = GrowPending(mood: mood.rawValue, at: ms)
    snap.save()
    WidgetCenter.shared.reloadTimelines(ofKind: GrowWidget.kind)
  }
}
