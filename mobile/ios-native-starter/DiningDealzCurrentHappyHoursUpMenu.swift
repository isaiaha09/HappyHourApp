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
  let imageURLs: [String]
  let imagePlaceholderColorHex: String?
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
    case imageURLs = "image_urls"
    case imagePlaceholderColorHex = "image_placeholder_color"
    case happyHours = "happy_hours"
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    slug = try container.decode(String.self, forKey: .slug)
    locationID = try container.decode(Int.self, forKey: .locationID)
    name = try container.decode(String.self, forKey: .name)
    city = try container.decode(String.self, forKey: .city)
    cityLabel = try container.decode(String.self, forKey: .cityLabel)
    venueTypeLabel = try container.decode(String.self, forKey: .venueTypeLabel)
    addressLine1 = try container.decode(String.self, forKey: .addressLine1)
    addressLine2 = try container.decode(String.self, forKey: .addressLine2)
    latitude = try container.decodeIfPresent(Double.self, forKey: .latitude)
    longitude = try container.decodeIfPresent(Double.self, forKey: .longitude)
    imageURLs = try container.decodeIfPresent([String].self, forKey: .imageURLs) ?? []
    imagePlaceholderColorHex = try container.decodeIfPresent(String.self, forKey: .imagePlaceholderColorHex)
    happyHours = try container.decode([DiningDealzCurrentHappyHourWindow].self, forKey: .happyHours)
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

  var sheetBackground: Color {
    switch self {
    case .dark:
      return Color(red: 0.07, green: 0.09, blue: 0.11)
    case .light:
      return Color(red: 0.97, green: 0.97, blue: 0.95)
    }
  }

  var sheetBorder: Color {
    switch self {
    case .dark:
      return Color(red: 0.22, green: 0.26, blue: 0.29)
    case .light:
      return Color(red: 0.84, green: 0.84, blue: 0.81)
    }
  }

  var cardBackground: Color {
    switch self {
    case .dark:
      return Color(red: 0.12, green: 0.15, blue: 0.17)
    case .light:
      return Color.white
    }
  }

  var cardBorder: Color {
    switch self {
    case .dark:
      return Color(red: 0.24, green: 0.28, blue: 0.31)
    case .light:
      return Color(red: 0.86, green: 0.86, blue: 0.83)
    }
  }

  var foreground: Color {
    switch self {
    case .dark:
      return Color.white.opacity(0.96)
    case .light:
      return Color(red: 0.14, green: 0.15, blue: 0.14)
    }
  }

  var mutedForeground: Color {
    switch self {
    case .dark:
      return Color.white.opacity(0.68)
    case .light:
      return Color(red: 0.40, green: 0.42, blue: 0.39)
    }
  }

  var sheetHandle: Color {
    switch self {
    case .dark:
      return Color(red: 0.42, green: 0.46, blue: 0.48)
    case .light:
      return Color(red: 0.76, green: 0.77, blue: 0.74)
    }
  }

  var imagePlaceholder: Color {
    switch self {
    case .dark:
      return Color(red: 0.22, green: 0.27, blue: 0.25)
    case .light:
      return Color(red: 0.86, green: 0.90, blue: 0.84)
    }
  }

  var accent: Color {
    Color(red: 1.0, green: 0.32, blue: 0.29)
  }
}

private func diningDealzCurrentHappyHoursColor(from hex: String?) -> Color? {
  guard let hex else {
    return nil
  }

  let normalizedHex = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
  guard normalizedHex.count == 6, let rgb = UInt64(normalizedHex, radix: 16) else {
    return nil
  }

  return Color(
    red: Double((rgb >> 16) & 0xff) / 255,
    green: Double((rgb >> 8) & 0xff) / 255,
    blue: Double(rgb & 0xff) / 255
  )
}

private struct DiningDealzTopRoundedRectangle: Shape {
  let cornerRadius: CGFloat

  func path(in rect: CGRect) -> Path {
    let radius = min(cornerRadius, min(rect.width, rect.height) / 2)
    var path = Path()

    path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
    path.addQuadCurve(
      to: CGPoint(x: rect.minX + radius, y: rect.minY),
      control: CGPoint(x: rect.minX, y: rect.minY)
    )
    path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
    path.addQuadCurve(
      to: CGPoint(x: rect.maxX, y: rect.minY + radius),
      control: CGPoint(x: rect.maxX, y: rect.minY)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.closeSubpath()

    return path
  }
}

struct DiningDealzCurrentHappyHoursUpMenu: View {
  let places: [DiningDealzCurrentHappyHourPlace]
  @Binding var isExpanded: Bool
  let bottomOffset: CGFloat
  let theme: DiningDealzCurrentHappyHoursTheme
  let onSelect: (DiningDealzCurrentHappyHourPlace) -> Void
  let onFavorite: (DiningDealzCurrentHappyHourPlace) -> Void
  let userLatitude: Double?
  let userLongitude: Double?
  let expandedSheetHeight: CGFloat

  private var collapsedSheetHeight: CGFloat {
    max(bottomOffset + 52, 132)
  }
  @State private var sheetDragOffset: CGFloat = 0
  @State private var sheetHorizontalOffset: CGFloat = 0

  init(
    places: [DiningDealzCurrentHappyHourPlace],
    isExpanded: Binding<Bool>,
    bottomOffset: CGFloat,
    theme: DiningDealzCurrentHappyHoursTheme,
    userLatitude: Double? = nil,
    userLongitude: Double? = nil,
    expandedSheetHeight: CGFloat = 620,
    onSelect: @escaping (DiningDealzCurrentHappyHourPlace) -> Void,
    onFavorite: @escaping (DiningDealzCurrentHappyHourPlace) -> Void
  ) {
    self.places = places
    self._isExpanded = isExpanded
    self.bottomOffset = bottomOffset
    self.theme = theme
    self.userLatitude = userLatitude
    self.userLongitude = userLongitude
    self.expandedSheetHeight = expandedSheetHeight
    self.onSelect = onSelect
    self.onFavorite = onFavorite
  }

  private var dealCount: Int {
    places.reduce(0) { $0 + $1.happyHours.count }
  }

  private var businessCount: Int {
    places.count
  }

  private var dealCountLabel: String {
    "\(dealCount) deal\(dealCount == 1 ? "" : "s") · \(businessCount) business\(businessCount == 1 ? "" : "es") nearby"
  }

  private var triggerAccessibilityLabel: String {
    "\(dealCountLabel). \(isExpanded ? "Close list." : "Open list.")"
  }

  @ViewBuilder
  var body: some View {
    if !places.isEmpty {
      Group {
        if isExpanded {
          VStack(spacing: 0) {
            sheetHandle
              .frame(maxWidth: .infinity)
              .contentShape(Rectangle())
              .simultaneousGesture(sheetGesture)
            expandedHeader
            expandedList
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
          .background(theme.sheetBackground)
          .overlay(alignment: .top) {
            Rectangle()
              .fill(theme.sheetBorder)
              .frame(height: 1)
          }
          .clipShape(DiningDealzTopRoundedRectangle(cornerRadius: 24))
          .overlay(
            DiningDealzTopRoundedRectangle(cornerRadius: 24)
              .stroke(theme.sheetBorder, lineWidth: 1)
          )
          .shadow(color: .black.opacity(theme == .dark ? 0.34 : 0.16), radius: 18, y: -5)
          .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
          collapsedHeader
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
      }
      .frame(maxWidth: .infinity)
      .frame(height: isExpanded ? expandedSheetHeight : collapsedSheetHeight, alignment: .bottom)
      .offset(x: sheetHorizontalOffset, y: sheetDragOffset)
    }
  }

  private var sheetHandle: some View {
    Capsule(style: .continuous)
      .fill(theme.sheetHandle)
      .frame(width: 42, height: 5)
      .padding(.top, 7)
      .padding(.bottom, 8)
      .accessibilityHidden(true)
  }

  private var collapsedHeader: some View {
    VStack(spacing: 0) {
      sheetHandle

      HStack(spacing: 9) {
        Circle()
          .fill(theme.accent)
          .frame(width: 7, height: 7)
          .accessibilityHidden(true)

        Text(dealCountLabel)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(theme.foreground)
      }
      .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
      .padding(.horizontal, 16)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(theme.sheetBackground)
    .clipShape(DiningDealzTopRoundedRectangle(cornerRadius: 24))
    .overlay(
      DiningDealzTopRoundedRectangle(cornerRadius: 24)
        .stroke(theme.sheetBorder, lineWidth: 1)
    )
    .shadow(color: .black.opacity(theme == .dark ? 0.34 : 0.16), radius: 18, y: -5)
    .contentShape(Rectangle())
    .accessibilityLabel(triggerAccessibilityLabel)
    .accessibilityHint("Swipe up to browse deals. Swipe down on the expanded sheet to close it.")
    .accessibilityAction(named: "Open current happy hour deals", toggleSheet)
    .gesture(sheetGesture)
  }

  private var expandedHeader: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 3) {
        Text("Happy Hour Deals and Specials Happening Now")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(theme.foreground)
          .lineLimit(3)
          .fixedSize(horizontal: false, vertical: true)

        Text(dealCountLabel)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(theme.mutedForeground)
      }

      Spacer(minLength: 0)

      Button(action: toggleSheet) {
        Image(systemName: "chevron.down")
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(theme.foreground)
          .frame(width: 44, height: 44)
          .background(theme.cardBackground, in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Close current happy hour deals")
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
    .contentShape(Rectangle())
  }

  private var expandedList: some View {
    ScrollView(.vertical, showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 12) {
        ForEach(places) { place in
          DiningDealzCurrentHappyHoursUpMenuCard(
            place: place,
            theme: theme,
            userLatitude: userLatitude,
            userLongitude: userLongitude,
            onFavorite: onFavorite,
            onSelect: onSelect
          )
        }
      }
      .padding(.horizontal, 14)
      .padding(.bottom, 28)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .contain)
  }

  private var sheetGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        var transaction = Transaction()
        transaction.animation = nil
        withTransaction(transaction) {
          if isExpanded && abs(value.translation.width) > abs(value.translation.height) {
            sheetHorizontalOffset = max(min(value.translation.width, 180), -180)
            sheetDragOffset = 0
          } else if isExpanded {
            sheetHorizontalOffset = 0
            sheetDragOffset = max(value.translation.height, 0)
          } else {
            sheetHorizontalOffset = 0
            sheetDragOffset = min(value.translation.height, 0)
          }
        }
      }
      .onEnded { value in
        let shouldDismissHorizontally = isExpanded
          && abs(value.translation.width) >= 72
          && abs(value.translation.width) > abs(value.translation.height)

        if shouldDismissHorizontally {
          let dismissDistance: CGFloat = 420
          let direction: CGFloat = value.translation.width >= 0 ? 1 : -1
          withAnimation(.easeOut(duration: 0.18)) {
            sheetHorizontalOffset = direction * dismissDistance
          }
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.easeInOut(duration: 0.26)) {
              sheetHorizontalOffset = 0
              sheetDragOffset = 0
              isExpanded = false
            }
          }
          return
        }

        let shouldExpand = !isExpanded && value.translation.height <= -72
        let shouldCollapse = isExpanded && value.translation.height >= 72
        let shouldOpenOnTap = !isExpanded
          && abs(value.translation.width) < 12
          && abs(value.translation.height) < 12

        if shouldExpand || shouldCollapse || shouldOpenOnTap {
          withAnimation(.easeInOut(duration: 0.26)) {
            isExpanded.toggle()
            sheetHorizontalOffset = 0
            sheetDragOffset = 0
          }
        } else {
          withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
            sheetHorizontalOffset = 0
            sheetDragOffset = 0
          }
        }
      }
  }

  private func toggleSheet() {
    withAnimation(.easeInOut(duration: 0.26)) {
      sheetHorizontalOffset = 0
      sheetDragOffset = 0
      isExpanded.toggle()
    }
  }
}

private struct DiningDealzCurrentHappyHoursUpMenuCard: View {
  let place: DiningDealzCurrentHappyHourPlace
  let theme: DiningDealzCurrentHappyHoursTheme
  let userLatitude: Double?
  let userLongitude: Double?
  let onFavorite: (DiningDealzCurrentHappyHourPlace) -> Void
  let onSelect: (DiningDealzCurrentHappyHourPlace) -> Void

  private var secondaryLabel: String {
    [place.cityLabel, place.venueTypeLabel]
      .filter { !$0.isEmpty }
      .joined(separator: " • ")
  }

  private var accessibilityLabel: String {
    let distance = diningDealzCurrentHappyHoursDistanceLabel(
      userLatitude: userLatitude,
      userLongitude: userLongitude,
      place: place
    )
    let windows = place.happyHours
      .map(diningDealzCurrentHappyHoursWindowSummary)
      .joined(separator: ", ")
    let distanceSummary = distance.map { ", \($0)" } ?? ""
    return "\(place.name)\(distanceSummary), \(windows). Open business details."
  }

  private var imageURL: URL? {
    place.imageURLs
      .compactMap { URL(string: $0.trimmingCharacters(in: .whitespacesAndNewlines)) }
      .first
  }

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Button(action: {
        onSelect(place)
      }) {
        VStack(spacing: 0) {
          imageHeader
          dealBody
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity, alignment: .leading)

      Button(action: {
        onFavorite(place)
      }) {
        Image(systemName: "heart")
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(Color(red: 0.12, green: 0.14, blue: 0.13))
          .frame(width: 28, height: 28)
          .background(Color.white, in: Circle())
      }
      .buttonStyle(.plain)
      .padding(.top, 9)
      .padding(.trailing, 10)
      .accessibilityLabel("Favorite \(place.name)")
    }
    .background(theme.cardBackground)
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 15, style: .continuous)
        .stroke(theme.cardBorder, lineWidth: 1)
    )
    .accessibilityLabel(accessibilityLabel)
  }

  private var imageHeader: some View {
    ZStack(alignment: .bottomLeading) {
      if let imageURL = imageURL {
        AsyncImage(url: imageURL) { phase in
          if let image = phase.image {
            image
              .resizable()
              .scaledToFill()
          } else {
            imagePlaceholder
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        imagePlaceholder
      }

      LinearGradient(
        colors: [.clear, .black.opacity(0.72)],
        startPoint: .top,
        endPoint: .bottom
      )

      VStack(alignment: .leading, spacing: 2) {
        Text(place.name)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)

        if !secondaryLabel.isEmpty {
          Text(secondaryLabel)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.86))
            .lineLimit(1)
        }
      }
      .padding(12)

      if let distance = diningDealzCurrentHappyHoursDistanceLabel(
        userLatitude: userLatitude,
        userLongitude: userLongitude,
        place: place
      ) {
        Text(distance)
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(Color.black.opacity(0.68), in: Capsule(style: .continuous))
          .padding(.top, 10)
          .padding(.trailing, 46)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      }

    }
    .frame(maxWidth: .infinity)
    .frame(height: 132)
    .clipped()
  }

  private var imagePlaceholder: some View {
    ZStack {
      diningDealzCurrentHappyHoursColor(from: place.imagePlaceholderColorHex) ?? theme.imagePlaceholder
      Image(systemName: placeholderSystemImage)
        .font(.system(size: 30, weight: .medium))
        .foregroundStyle(theme.mutedForeground)
    }
  }

  private var placeholderSystemImage: String {
    let normalizedLabel = place.venueTypeLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

    if normalizedLabel.contains("cafe") || normalizedLabel.contains("coffee") {
      return "cup.and.saucer.fill"
    }
    if normalizedLabel.contains("bar") || normalizedLabel.contains("wine") {
      return "wineglass.fill"
    }
    if normalizedLabel.contains("fast") {
      return "takeoutbag.and.cup.and.straw.fill"
    }
    if normalizedLabel.contains("mobile") || normalizedLabel.contains("vendor") {
      return "bus.fill"
    }
    if normalizedLabel.contains("shop") || normalizedLabel.contains("store") {
      return "storefront.fill"
    }
    if normalizedLabel.contains("attraction") {
      return "star.fill"
    }

    return "fork.knife"
  }

  private var dealBody: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(place.happyHours) { window in
        Text(diningDealzCurrentHappyHoursDealLine(window))
          .font(.system(size: 15, weight: .regular))
          .foregroundStyle(theme.foreground)
          .lineLimit(2)
          .padding(.bottom, 2)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      HStack(alignment: .center) {
        Text(place.happyHours.map(diningDealzCurrentHappyHoursWindowDetails).joined(separator: " • "))
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(theme.accent)
          .padding(.horizontal, 7)
          .padding(.vertical, 4)
          .overlay(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
              .stroke(theme.accent, lineWidth: 1)
          )
      }
      .padding(.top, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 13)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private func diningDealzCurrentHappyHoursWindowSummary(_ window: DiningDealzCurrentHappyHourWindow) -> String {
  "\(diningDealzCurrentHappyHoursDealLine(window)), \(diningDealzCurrentHappyHoursWindowDetails(window))"
}

private func diningDealzCurrentHappyHoursDealLine(_ window: DiningDealzCurrentHappyHourWindow) -> String {
  let price = window.priceText.trimmingCharacters(in: .whitespacesAndNewlines)
  let title = window.title.trimmingCharacters(in: .whitespacesAndNewlines)
  return [price, title].filter { !$0.isEmpty }.joined(separator: " ")
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

  return "\(start) - \(end)"
}

private func diningDealzCurrentHappyHoursDisplayTime(_ value: String) -> String {
  let pieces = value.split(separator: ":", omittingEmptySubsequences: true)
  guard pieces.count >= 2,
        let hour = Int(pieces[0]),
        let minutes = Int(pieces[1]),
        (0...23).contains(hour),
        (0...59).contains(minutes) else {
    return value
  }

  let period = hour >= 12 ? "PM" : "AM"
  let displayHour = hour % 12 == 0 ? 12 : hour % 12
  return "\(displayHour):\(String(format: "%02d", minutes)) \(period)"
}

private func diningDealzCurrentHappyHoursDistanceLabel(
  userLatitude: Double?,
  userLongitude: Double?,
  place: DiningDealzCurrentHappyHourPlace
) -> String? {
  guard let userLatitude = userLatitude,
        let userLongitude = userLongitude,
        let latitude = place.latitude,
        let longitude = place.longitude else {
    return nil
  }

  let miles = diningDealzCurrentHappyHoursDistanceInMiles(
    originLatitude: userLatitude,
    originLongitude: userLongitude,
    destinationLatitude: latitude,
    destinationLongitude: longitude
  )
  guard miles.isFinite else { return nil }
  if miles < 0.15 { return "Nearby" }

  let roundedMiles = miles < 10 ? (miles * 10).rounded() / 10 : miles.rounded()
  let displayMiles = roundedMiles == roundedMiles.rounded()
    ? String(Int(roundedMiles))
    : String(format: "%.1f", roundedMiles)
  return "\(displayMiles) mi"
}

private func diningDealzCurrentHappyHoursDistanceInMiles(
  originLatitude: Double,
  originLongitude: Double,
  destinationLatitude: Double,
  destinationLongitude: Double
) -> Double {
  let earthRadiusMiles = 3958.8
  let latitudeDeltaRadians = (destinationLatitude - originLatitude) * .pi / 180
  let longitudeDeltaRadians = (destinationLongitude - originLongitude) * .pi / 180
  let originLatitudeRadians = originLatitude * .pi / 180
  let destinationLatitudeRadians = destinationLatitude * .pi / 180
  let a = sin(latitudeDeltaRadians / 2) * sin(latitudeDeltaRadians / 2)
    + cos(originLatitudeRadians)
    * cos(destinationLatitudeRadians)
    * sin(longitudeDeltaRadians / 2)
    * sin(longitudeDeltaRadians / 2)
  let c = 2 * atan2(sqrt(a), sqrt(1 - a))
  return earthRadiusMiles * c
}
