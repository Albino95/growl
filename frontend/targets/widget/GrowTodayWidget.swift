import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Bundle

@main
struct GrowWidgetBundle: WidgetBundle {
  var body: some Widget {
    GrowTodayWidget()
  }
}

struct GrowTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: GrowWidget.kind, provider: GrowTodayProvider()) { entry in
      GrowTodayEntryView(entry: entry)
        .containerBackground(for: .widget) { Color("GrowBackground") }
    }
    .configurationDisplayName("Grow! Today")
    .description("Your streak and a one-tap check-in.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}

// MARK: - Timeline

struct GrowTodayEntry: TimelineEntry {
  let date: Date
  let snapshot: GrowSnapshot?
}

struct GrowTodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> GrowTodayEntry {
    GrowTodayEntry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (GrowTodayEntry) -> Void) {
    let snap = context.isPreview ? (GrowSnapshot.load() ?? .placeholder) : GrowSnapshot.load()
    completion(GrowTodayEntry(date: Date(), snapshot: snap))
  }

  /// One entry now, one at each greeting boundary (12:00, 18:00, 23:00), one
  /// when an optimistic "Checking in…" expires, and one at midnight (the new
  /// day resets to unchecked). After midnight WidgetKit asks again. The app
  /// also reloads the timeline every time it writes a snapshot.
  func getTimeline(in context: Context, completion: @escaping (Timeline<GrowTodayEntry>) -> Void) {
    let now = Date()
    let snap = GrowSnapshot.load()
    let cal = Calendar.current
    let midnight = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 0),
                                matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)

    var dates: [Date] = [now]
    for hour in [5, 12, 18, 23] {
      if let d = cal.date(bySettingHour: hour, minute: 0, second: 0, of: now), d > now, d < midnight {
        dates.append(d)
      }
    }
    if let p = snap?.pending {
      let expiry = Date(timeIntervalSince1970: p.at / 1000).addingTimeInterval(GrowWidget.pendingTTL)
      if expiry > now, expiry < midnight { dates.append(expiry) }
    }
    dates.append(midnight)
    let entries = dates.sorted().map { GrowTodayEntry(date: $0, snapshot: snap) }
    completion(Timeline(entries: entries, policy: .after(midnight.addingTimeInterval(60))))
  }
}

// MARK: - Resolved state (snapshot interpreted at the entry's date)

struct GrowTodayState {
  enum Phase { case signedOut, open, pending(GrowMood), checkedIn(GrowMood?), rest }

  let phase: Phase
  let streak: Int?
  let path: String?
  let lifeModeLabel: String?
  let restDaysLeft: Int?
  let friends: [GrowFriend]
  let week: [GrowWeekDay]
  let date: Date

  init(entry: GrowTodayEntry) {
    date = entry.date
    let s = entry.snapshot
    let isToday = s?.day == GrowSnapshot.dayKey(entry.date)
    streak = s?.streak
    lifeModeLabel = s?.lifeModeLabel
    restDaysLeft = s?.restDaysLeft
    week = s?.week ?? []
    friends = isToday ? Array((s?.friends ?? []).prefix(4)) : []
    path = isToday ? s?.path : nil

    guard let s = s, s.signedIn != false else {
      phase = .signedOut
      return
    }
    if isToday, s.restDay == true {
      phase = .rest
    } else if isToday, s.checkedIn == true {
      phase = .checkedIn(s.mood.flatMap(GrowMood.init(rawValue:)))
    } else if let p = s.pending, let m = GrowMood(rawValue: p.mood),
              entry.date.timeIntervalSince1970 * 1000 - p.at < GrowWidget.pendingTTL * 1000,
              GrowSnapshot.dayKey(Date(timeIntervalSince1970: p.at / 1000)) == GrowSnapshot.dayKey(entry.date) {
      phase = .pending(m)
    } else {
      phase = .open
    }
  }

  var greeting: String {
    let h = Calendar.current.component(.hour, from: date)
    switch h {
    case 5...11: return "Good morning"
    case 12...17: return "Good afternoon"
    case 18...22: return "Good evening"
    default: return "Hello, night owl"
    }
  }

  var weekday: String {
    date.formatted(.dateTime.weekday(.abbreviated))
  }

  var dayLabel: String {
    date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
  }
}

// MARK: - Views

struct GrowTodayEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: GrowTodayEntry

  var body: some View {
    let state = GrowTodayState(entry: entry)
    Group {
      switch family {
      case .systemMedium: GrowMediumView(state: state)
      case .accessoryCircular: GrowCircularView(state: state)
      case .accessoryRectangular: GrowRectangularView(state: state)
      default: GrowSmallView(state: state)
      }
    }
    .widgetURL(URL(string: "growl://home"))
    .dynamicTypeSize(...DynamicTypeSize.xxLarge)
  }
}

private let ink = Color("GrowInk")
private let muted = Color("GrowMuted")
private let chip = Color("GrowChip")
private let emerald = Color("GrowEmerald")

struct StreakPill: View {
  let streak: Int?
  var long = false

  var body: some View {
    let n = streak ?? 0
    HStack(spacing: 3) {
      Text("🌱").font(.caption)
      Text(long ? "\(n)-day streak" : "\(n)")
        .font(.caption.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(ink)
    }
    .padding(.horizontal, 7)
    .padding(.vertical, 3)
    .background(Capsule().fill(chip))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(n == 1 ? "1 day streak" : "\(n) day streak")
  }
}

struct MoodButton: View {
  let mood: GrowMood
  var showLabel = false

  var body: some View {
    Button(intent: CheckInMoodIntent(mood: mood.rawValue)) {
      VStack(spacing: 2) {
        Text(mood.emoji)
          .font(.system(size: showLabel ? 20 : 17))
          .frame(maxWidth: .infinity, minHeight: showLabel ? 34 : 30)
          .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(chip))
        if showLabel {
          Text(mood.label)
            .font(.caption2.weight(.medium))
            .foregroundStyle(muted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Check in: \(mood.label)")
  }
}

struct MoodRow: View {
  var showLabels = false
  var body: some View {
    HStack(spacing: showLabels ? 6 : 3) {
      ForEach(GrowMood.allCases) { MoodButton(mood: $0, showLabel: showLabels) }
    }
  }
}

/// Status block shared by small + medium: pending / checked-in / rest / signed-out.
struct StatusBlock: View {
  let state: GrowTodayState

  var body: some View {
    switch state.phase {
    case .signedOut:
      VStack(alignment: .leading, spacing: 2) {
        Text("Grow!").font(.headline).foregroundStyle(ink)
        Text("Open the app to start your streak.")
          .font(.caption).foregroundStyle(muted).lineLimit(3)
      }
    case .pending(let m):
      VStack(alignment: .leading, spacing: 4) {
        Text(m.emoji).font(.title2)
        HStack(spacing: 4) {
          ProgressView().controlSize(.mini).tint(emerald)
          Text("Checking in…").font(.subheadline.weight(.semibold)).foregroundStyle(ink)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("Checking in, \(m.label)")
    case .checkedIn(let m):
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 4) {
          Image(systemName: "checkmark.circle.fill").foregroundStyle(emerald)
          Text("Checked in").font(.subheadline.weight(.semibold)).foregroundStyle(ink)
        }
        if let m = m {
          Text("\(m.emoji) \(m.label)").font(.subheadline).foregroundStyle(ink).lineLimit(1)
        }
        if let p = state.path, !p.isEmpty {
          Text(p).font(.caption).foregroundStyle(muted).lineLimit(1)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(
        ["Checked in today", m?.label, state.path].compactMap { $0 }.filter { !$0.isEmpty }
          .joined(separator: ", "))
    case .rest:
      VStack(alignment: .leading, spacing: 3) {
        Text("🌿").font(.title3)
        Text("Rest day").font(.subheadline.weight(.semibold)).foregroundStyle(ink)
        Text("Your streak is safe.").font(.caption).foregroundStyle(muted).lineLimit(2)
      }
      .accessibilityElement(children: .combine)
    case .open:
      EmptyView()
    }
  }
}

struct GrowSmallView: View {
  let state: GrowTodayState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        if case .signedOut = state.phase {} else { StreakPill(streak: state.streak) }
        Spacer(minLength: 4)
        Text(state.weekday).font(.caption.weight(.medium)).foregroundStyle(muted)
      }
      Spacer(minLength: 0)
      if case .open = state.phase {
        VStack(alignment: .leading, spacing: 1) {
          Text(state.greeting).font(.caption).foregroundStyle(muted).lineLimit(1)
          Text("How’s today?").font(.headline).foregroundStyle(ink).lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        if let lm = state.lifeModeLabel {
          Text(lm).font(.caption2).foregroundStyle(muted).lineLimit(1)
        }
        MoodRow()
      } else {
        StatusBlock(state: state)
      }
    }
  }
}

struct GrowMediumView: View {
  let state: GrowTodayState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center) {
        if case .signedOut = state.phase {} else { StreakPill(streak: state.streak, long: true) }
        Spacer(minLength: 4)
        Text(state.dayLabel).font(.caption.weight(.medium)).foregroundStyle(muted)
      }
      if case .open = state.phase {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text("\(state.greeting) — how’s today?")
            .font(.subheadline.weight(.semibold)).foregroundStyle(ink).lineLimit(1)
            .minimumScaleFactor(0.8)
          Spacer(minLength: 0)
        }
        Spacer(minLength: 0)
        MoodRow(showLabels: true)
        FooterRow(state: state)
      } else {
        HStack(alignment: .bottom, spacing: 12) {
          StatusBlock(state: state)
          Spacer(minLength: 0)
        }
        Spacer(minLength: 0)
        FooterRow(state: state)
      }
    }
  }
}

/// Friends who checked in today (initials only, no network images), or the
/// week dots when there are none; plus a life-mode / rest-day indicator.
struct FooterRow: View {
  let state: GrowTodayState

  var body: some View {
    HStack(spacing: 8) {
      if !state.friends.isEmpty {
        HStack(spacing: -6) {
          ForEach(Array(state.friends.enumerated()), id: \.offset) { _, f in
            Text(f.initial.prefix(1).uppercased())
              .font(.caption2.weight(.bold))
              .foregroundStyle(.white)
              .frame(width: 22, height: 22)
              .background(Circle().fill(Color(hex: f.color) ?? emerald))
              .overlay(Circle().stroke(Color("GrowBackground"), lineWidth: 2))
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
          state.friends.count == 1 ? "1 friend checked in today" : "\(state.friends.count) friends checked in today")
        Text("checked in").font(.caption2).foregroundStyle(muted).accessibilityHidden(true)
      } else if !state.week.isEmpty {
        WeekDots(week: state.week, today: GrowSnapshot.dayKey(state.date))
      }
      Spacer(minLength: 0)
      if let lm = state.lifeModeLabel {
        IndicatorChip(symbol: "pause.circle", text: lm)
      } else if case .rest = state.phase {
        EmptyView()
      } else if case .signedOut = state.phase {
        EmptyView()
      } else if let left = state.restDaysLeft, left > 0 {
        IndicatorChip(symbol: "leaf", text: left == 1 ? "1 rest day" : "\(left) rest days")
      }
    }
  }
}

struct IndicatorChip: View {
  let symbol: String
  let text: String
  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: symbol).font(.caption2)
      Text(text).font(.caption2.weight(.medium)).lineLimit(1)
    }
    .foregroundStyle(muted)
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background(Capsule().fill(chip))
    .accessibilityElement(children: .combine)
  }
}

struct WeekDots: View {
  let week: [GrowWeekDay]
  let today: String

  var body: some View {
    HStack(spacing: 4) {
      ForEach(week, id: \.day) { d in
        dot(for: d)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("This week: \(week.filter { $0.status == "active" }.count) of \(week.count) days grown")
  }

  @ViewBuilder
  private func dot(for d: GrowWeekDay) -> some View {
    let size: CGFloat = 9
    switch d.status {
    case "active":
      Circle().fill(emerald).frame(width: size, height: size)
    case "rest":
      Circle().fill(emerald.opacity(0.35)).frame(width: size, height: size)
    case "missed":
      Circle().fill(muted.opacity(0.35)).frame(width: size, height: size)
    default:
      Circle().stroke(d.day == today ? emerald : muted.opacity(0.4), lineWidth: 1.5)
        .frame(width: size, height: size)
    }
  }
}

// MARK: Lock Screen

struct GrowCircularView: View {
  let state: GrowTodayState

  var body: some View {
    let done: Bool = {
      switch state.phase {
      case .checkedIn, .rest: return true
      default: return false
      }
    }()
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 0) {
        Image(systemName: done ? "leaf.fill" : "leaf")
          .font(.system(size: 14, weight: .semibold))
        Text("\(state.streak ?? 0)")
          .font(.system(.title3, design: .rounded).weight(.bold))
          .monospacedDigit()
          .minimumScaleFactor(0.6)
      }
    }
    .widgetAccentable()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(state.streak ?? 0) day streak. \(done ? "Checked in today" : "Not checked in yet")")
  }
}

struct GrowRectangularView: View {
  let state: GrowTodayState

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 4) {
        Image(systemName: "leaf.fill").widgetAccentable()
        Text("\(state.streak ?? 0)-day streak").font(.headline).monospacedDigit()
      }
      Text(subtitle).font(.caption).lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private var subtitle: String {
    switch state.phase {
    case .signedOut: return "Open Grow! to start"
    case .pending: return "Checking in…"
    case .checkedIn(let m): return m.map { "Checked in · \($0.label)" } ?? "Checked in"
    case .rest: return "Rest day · streak safe"
    case .open: return state.lifeModeLabel ?? "Tap to check in"
    }
  }
}

// MARK: - Helpers

extension Color {
  init?(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt64(s, radix: 16) else { return nil }
    self.init(
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255)
  }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
  GrowTodayWidget()
} timeline: {
  GrowTodayEntry(date: .now, snapshot: .placeholder)
}

#Preview(as: .systemMedium) {
  GrowTodayWidget()
} timeline: {
  GrowTodayEntry(date: .now, snapshot: .placeholder)
}
