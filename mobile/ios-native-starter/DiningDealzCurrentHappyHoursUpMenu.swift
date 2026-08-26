import Foundation
import SwiftUI

struct DiningDealzCurrentHappyHourWindow: Codable, Hashable, Identifiable {
  let dealID: Int?
  let title: String
  let priceText: String
  let weekdayLabel: String
  let startTime: String
  let endTime: String
  let allDay: Bool

  var id: String {
    let dealIdentity = dealID.map { String($0) } ?? title
    return [
      dealIdentity,
      priceText,
      weekdayLabel,
      startTime,
      endTime,
      allDay ? "all-day" : "timed",
    ].joined(separator: "|")
  }

  private enum CodingKeys: String, CodingKey {
    case dealID = "deal_id"
    case title
    case priceText = "price_text"
    case weekdayLabel = "weekday_label"
    case startTime = "start_time"
    case endTime = "end_time"
    case allDay = "all_day"
  }
}

struct DiningDealzCurrentHappyHourPlace: Codable, Hashable, Identifiable {
  let slug: String
  let locationID: Int
  let name: String
  let city: String
  let cityLabel: String
  let venueTypeLabel: String
  let addressLine1: String
  let addressLine2: String
  let latitude: Double?
  let longitude: Double?
  let happyHours: [DiningDealzCurrentHappyHourWindow]

  var id: String { "\(slug):\(locationID)" }

  private enum CodingKeys: String, CodingKey {
    case slug
    case locationID = "location_id"
    case name
    case city
    case cityLabel = "city_label"
    case venueTypeLabel = "venue_type_label"
    case addressLine1 = "address_line_1"
    case addressLine2 = "address_line_2"
    case latitude
    case longitude
    case happyHours = "happy_hours"
  }
}

struct DiningDealzCurrentHappyHoursResponse: Codable {
  let observedAt: String
  let places: [DiningDealzCurrentHappyHourPlace]

  private enum CodingKeys: String, CodingKey {
    case observedAt = "observed_at"
    case places
  }
}

enum DiningDealzCurrentHappyHoursTheme: Equatable {
  case dark
  case light

  var foreground: Color {
    switch self {
    case .dark:
      return Color.white.opacity(0.96)
    case .light:
      return Color(red: 0.09, green: 0.12, blue: 0.17)
    }
  }

  var mutedForeground: Color {
    switch self {
    case .dark:
      return Color.white.opacity(0.64)
    case .light:
      return Color(red: 0.26, green: 0.31, blue: 0.38)
    }
  }

  var border: Color {
    switch self {
    case .dark:
      return Color(red: 1.0, green: 0.37, blue: 0.41).opacity(0.58)
    case .light:
      return Color(red: 0.62, green: 0.69, blue: 0.78).opacity(0.9)
    }
  }

  var rowFill: Color {
    switch self {
    case .dark:
      return Color.black.opacity(0.2)
    case .light:
      return Color.white.opacity(0.74)
    }
  }

  var liveDot: Color {
    Color(red: 1.0, green: 0.43, blue: 0.18)
  }
}

struct DiningDealzCurrentHappyHoursUpMenu: View {
  let places: [DiningDealzCurrentHappyHourPlace]
  @Binding var isExpanded: Bool
  let bottomOffset: CGFloat
  let theme: DiningDealzCurrentHappyHoursTheme
  let onSelect: (DiningDealzCurrentHappyHourPlace) -> Void

  private var countLabel: String {
    "\(places.count) happy hour\(places.count == 1 ? "" : "s") happening now"
  }

  private var triggerAccessibilityLabel: String {
    "\(countLabel). \(isExpanded ? "Close list." : "Open list.")"
  }

  @ViewBuilder
  var body: some View {
    if !places.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        if isExpanded {
          expandedList
        }

        Button(action: {
          withAnimation(.easeOut(duration: 0.2)) {
            isExpanded.toggle()
          }
        }) {
          HStack(spacing: 8) {
            Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
              .font(.system(size: 16, weight: .bold))
              .accessibilityHidden(true)

            Circle()
              .fill(theme.liveDot)
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)

            Text("\(places.count) happy hour\(places.count == 1 ? "" : "s") now")
              .font(.system(size: 14, weight: .bold))
              .foregroundColor(theme.foreground)
          }
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .frame(minHeight: 46)
        }
        .buttonStyle(.plain)
        .foregroundColor(theme.foreground)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(theme.border, lineWidth: 1))
        .accessibilityLabel(triggerAccessibilityLabel)
        .accessibilityHint("Shows businesses offering happy hours at the current time.")
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 18)
      .padding(.bottom, bottomOffset)
      .animation(.easeOut(duration: 0.2), value: isExpanded)
    }
  }

  @ViewBuilder
  private var expandedList: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 7) {
            Circle()
              .fill(theme.liveDot)
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            Text("Happy hours happening now")
              .font(.system(size: 16, weight: .bold))
              .foregroundColor(theme.foreground)
          }

          Text(places.count == 1 ? "1 business" : "\(places.count) businesses")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(theme.mutedForeground)
        }

        Spacer(minLength: 8)

        Button(action: {
          withAnimation(.easeOut(duration: 0.2)) {
            isExpanded = false
          }
        }) {
          Image(systemName: "chevron.down")
            .font(.system(size: 15, weight: .bold))
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .foregroundColor(theme.foreground)
        .accessibilityLabel("Close businesses with happy hours now")
      }

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 8) {
          ForEach(places) { place in
            DiningDealzCurrentHappyHoursUpMenuRow(
              place: place,
              theme: theme,
              onSelect: onSelect
            )
          }
        }
        .padding(10)
      }
      .frame(maxHeight: 300)
    }
    .padding(.horizontal, 4)
    .padding(.top, 4)
    .padding(.bottom, 4)
    .frame(maxWidth: 380)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(theme.border, lineWidth: 1)
    )
    .transition(.move(edge: .bottom).combined(with: .opacity))
  }
}

private struct DiningDealzCurrentHappyHoursUpMenuRow: View {
  let place: DiningDealzCurrentHappyHourPlace
  let theme: DiningDealzCurrentHappyHoursTheme
  let onSelect: (DiningDealzCurrentHappyHourPlace) -> Void

  private var secondaryLabel: String {
    [place.cityLabel, place.venueTypeLabel]
      .filter { !$0.isEmpty }
      .joined(separator: " | ")
  }

  private var accessibilityLabel: String {
    let windowSummary = place.happyHours
      .map(diningDealzCurrentHappyHoursWindowSummary)
      .joined(separator: ", ")
    return "\(place.name), \(windowSummary). Open business details."
  }

  var body: some View {
    Button(action: {
      onSelect(place)
    }) {
      HStack(alignment: .top, spacing: 10) {
        VStack(alignment: .leading, spacing: 2) {
          Text(place.name)
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(theme.foreground)
            .lineLimit(1)

          if !secondaryLabel.isEmpty {
            Text(secondaryLabel)
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(theme.mutedForeground)
              .lineLimit(1)
          }

          ForEach(place.happyHours) { window in
            VStack(alignment: .leading, spacing: 0) {
              Text(window.title)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(theme.foreground)
                .lineLimit(1)

              Text(diningDealzCurrentHappyHoursWindowDetails(window))
                .font(.system(size: 12))
                .foregroundColor(theme.mutedForeground)
                .lineLimit(1)
            }
          }
        }

        Spacer(minLength: 0)

        Image(systemName: "arrow.forward")
          .font(.system(size: 15, weight: .semibold))
          .foregroundColor(theme.mutedForeground)
          .accessibilityHidden(true)
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .buttonStyle(.plain)
    .background(theme.rowFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(theme.border.opacity(0.52), lineWidth: 1)
    )
    .accessibilityLabel(accessibilityLabel)
    .accessibilityRole(.button)
  }
}

private func diningDealzCurrentHappyHoursWindowSummary(_ window: DiningDealzCurrentHappyHourWindow) -> String {
  if window.allDay {
    return "\(window.title) - All day"
  }

  return "\(window.title) - \(diningDealzCurrentHappyHoursWindowDetails(window))"
}

private func diningDealzCurrentHappyHoursWindowDetails(_ window: DiningDealzCurrentHappyHourWindow) -> String {
  if window.allDay {
    return "All day"
  }

  let start = diningDealzCurrentHappyHoursDisplayTime(window.startTime)
  let end = diningDealzCurrentHappyHoursDisplayTime(window.endTime)
  guard !start.isEmpty, !end.isEmpty else {
    return "Happening now"
  }

  return "\(start)-\(end)\(window.priceText.isEmpty ? "" : " | \(window.priceText)")"
}

private func diningDealzCurrentHappyHoursDisplayTime(_ value: String) -> String {
  let pieces = value.split(separator: ":", omittingEmptySubsequences: true)
  guard pieces.count >= 2, let hour = Int(pieces[0]), let minutes = Int(pieces[1]), (0...23).contains(hour), (0...59).contains(minutes) else {
    return value
  }

  let period = hour >= 12 ? "PM" : "AM"
  let displayHour = hour % 12 == 0 ? 12 : hour % 12
  return "\(displayHour):\(String(format: "%02d", minutes)) \(period)"
}
