import Foundation
import SwiftUI

struct DiningDealzPlannerActionReference: Codable, Hashable {
  let slug: String
  let locationId: Int?
  let dealId: Int?
  let happyHourWindowId: Int?
}

struct DiningDealzPlannerSchedule: Codable, Hashable, Identifiable {
  let id: String
  let label: String
  let startTime: String
  let endTime: String
  let allDay: Bool
  let weekday: Int?
  let weekdayLabel: String?
  let kind: String
  let dealId: Int?
  let dealTitle: String?
}

struct DiningDealzPlannerDeal: Codable, Hashable, Identifiable {
  let id: Int
  let title: String
  let description: String
  let priceText: String
  let terms: String
  let dealTypeLabel: String
  let happyHours: [DiningDealzPlannerSchedule]
  let menuText: String?
  let imageUrl: String?
}

struct DiningDealzPlannerContext: Codable, Hashable {
  let reference: DiningDealzPlannerActionReference
  let name: String
  let cityLabel: String
  let venueTypeLabel: String
  let address: String
  let latitude: Double?
  let longitude: Double?
  let imageUrls: [String]
  let timeZone: String
  let schedules: [DiningDealzPlannerSchedule]
  let deals: [DiningDealzPlannerDeal]
}

struct DiningDealzNativeCalendarDraft: Codable, Hashable {
  let title: String
  let startAt: Date
  let endAt: Date
  let timeZone: String
  let location: String?
  let notes: String
  let weeklyRepeat: Bool
  let allDay: Bool
}

struct DiningDealzNativeShareSelection: Codable, Hashable {
  let mode: String
  let date: String?
  let startTime: String?
  let endTime: String?
  let includeHappyHours: Bool
  let includeOperatingHours: Bool
  let includeDealsAndMenu: Bool
  let includePhotos: Bool
  let includeLocation: Bool
  let selectedDealIds: [Int]
  let selectedPhotoUri: String?
}

private enum DiningDealzPlannerPalette {
  static let background = Color(red: 0.065, green: 0.085, blue: 0.105)
  static let card = Color(red: 0.12, green: 0.15, blue: 0.17)
  static let border = Color(red: 0.24, green: 0.29, blue: 0.32)
  static let muted = Color.white.opacity(0.68)
  static let accent = Color(red: 1.0, green: 0.34, blue: 0.38)
}

struct DiningDealzCalendarComposerView: View {
  let context: DiningDealzPlannerContext
  let onComplete: (DiningDealzNativeCalendarDraft) -> Void
  let onCancel: () -> Void

  @State private var selectedDate: Date
  @State private var startDate: Date
  @State private var endDate: Date
  @State private var selectedScheduleID: String?
  @State private var allDay: Bool
  @State private var weeklyRepeat = false
  @State private var validationMessage: String?

  init(
    context: DiningDealzPlannerContext,
    onComplete: @escaping (DiningDealzNativeCalendarDraft) -> Void,
    onCancel: @escaping () -> Void
  ) {
    self.context = context
    self.onComplete = onComplete
    self.onCancel = onCancel
    let schedule = context.schedules.first
    let initialDate = diningDealzPlannerDate(for: schedule, timeZone: context.timeZone)
    let initialStart = diningDealzPlannerTime(on: initialDate, value: schedule?.startTime ?? "09:00", timeZone: context.timeZone)
    let initialEnd = diningDealzPlannerTime(on: initialDate, value: schedule?.endTime ?? "10:00", nextDay: schedule.map { diningDealzPlannerIsOvernight(start: $0.startTime, end: $0.endTime) } ?? false, timeZone: context.timeZone)
    _selectedDate = State(initialValue: initialDate)
    _startDate = State(initialValue: initialStart)
    _endDate = State(initialValue: initialEnd)
    _selectedScheduleID = State(initialValue: schedule?.id)
    _allDay = State(initialValue: schedule?.allDay ?? false)
  }

  var body: some View {
    NavigationView {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text("Choose a time")
            .font(.headline)
            .foregroundStyle(.white)

          if !context.schedules.isEmpty {
            ForEach(context.schedules) { schedule in
              Button {
                select(schedule)
              } label: {
                VStack(alignment: .leading, spacing: 4) {
                  Text(schedule.label)
                    .font(.subheadline.weight(.bold))
                  Text(scheduleSummary(schedule))
                    .font(.caption)
                    .foregroundStyle(DiningDealzPlannerPalette.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(selectedScheduleID == schedule.id ? DiningDealzPlannerPalette.accent.opacity(0.22) : DiningDealzPlannerPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(selectedScheduleID == schedule.id ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border, lineWidth: 1))
              }
              .buttonStyle(.plain)
              .foregroundStyle(.white)
              .accessibilityLabel("Use " + schedule.label + ", " + scheduleSummary(schedule))
            }
          }

          Button {
            selectedScheduleID = nil
            validationMessage = nil
          } label: {
            Label("Custom time", systemImage: "slider.horizontal.3")
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .buttonStyle(.bordered)
          .tint(selectedScheduleID == nil ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border)

          DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
            .datePickerStyle(.compact)
            .foregroundStyle(.white)
          DatePicker("Start", selection: $startDate, displayedComponents: .hourAndMinute)
            .datePickerStyle(.compact)
            .foregroundStyle(.white)
            .disabled(allDay)
          DatePicker("End", selection: $endDate, displayedComponents: .hourAndMinute)
            .datePickerStyle(.compact)
            .foregroundStyle(.white)
            .disabled(allDay)

          Toggle("All-day event", isOn: $allDay)
            .tint(DiningDealzPlannerPalette.accent)
          Toggle("Repeat weekly", isOn: $weeklyRepeat)
            .tint(DiningDealzPlannerPalette.accent)

          if let validationMessage {
            Text(validationMessage)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.red)
          }

          Text("DiningDealz opens your device calendar editor. Existing calendar events are never read.")
            .font(.footnote)
            .foregroundStyle(DiningDealzPlannerPalette.muted)

          Button("Open Calendar") {
            submit()
          }
          .buttonStyle(.borderedProminent)
          .tint(DiningDealzPlannerPalette.accent)
          .frame(maxWidth: .infinity)
        }
        .padding(20)
      }
      .background(DiningDealzPlannerPalette.background)
      .navigationTitle("Add to Calendar")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
      }
    }
    .environment(\.timeZone, TimeZone(identifier: context.timeZone) ?? .autoupdatingCurrent)
    .preferredColorScheme(.dark)
  }

  private func select(_ schedule: DiningDealzPlannerSchedule) {
    let date = diningDealzPlannerDate(for: schedule, timeZone: context.timeZone)
    selectedDate = date
    startDate = diningDealzPlannerTime(on: date, value: schedule.startTime, timeZone: context.timeZone)
    endDate = diningDealzPlannerTime(on: date, value: schedule.endTime, nextDay: diningDealzPlannerIsOvernight(start: schedule.startTime, end: schedule.endTime), timeZone: context.timeZone)
    selectedScheduleID = schedule.id
    allDay = schedule.allDay
    validationMessage = nil
  }

  private func submit() {
    let calendar = diningDealzPlannerCalendar(timeZone: context.timeZone)
    let start = allDay ? calendar.startOfDay(for: selectedDate) : diningDealzPlannerDateWithTime(on: selectedDate, from: startDate, timeZone: context.timeZone)
    let end: Date
    if allDay {
      end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
    } else {
      let sameDayEnd = diningDealzPlannerDateWithTime(on: selectedDate, from: endDate, timeZone: context.timeZone)
      end = sameDayEnd <= start
        ? (calendar.date(byAdding: .day, value: 1, to: sameDayEnd) ?? sameDayEnd)
        : sameDayEnd
    }

    guard end > start else {
      validationMessage = "End time must be after the start time."
      return
    }

    let schedule = context.schedules.first { $0.id == selectedScheduleID }
    onComplete(DiningDealzNativeCalendarDraft(
      title: context.name,
      startAt: start,
      endAt: end,
      timeZone: context.timeZone,
      location: context.address.isEmpty ? nil : context.address,
      notes: diningDealzPlannerNotes(context: context, schedule: schedule),
      weeklyRepeat: weeklyRepeat,
      allDay: allDay
    ))
  }
}

struct DiningDealzShareComposerView: View {
  let context: DiningDealzPlannerContext
  let onComplete: (DiningDealzNativeShareSelection) -> Void
  let onCancel: () -> Void

  @State private var mode = "restaurant-details"
  @State private var date = diningDealzPlannerDateString(Date(), timeZone: TimeZone.autoupdatingCurrent.identifier)
  @State private var startTime = ""
  @State private var endTime = ""
  @State private var includeHappyHours: Bool
  @State private var includeOperatingHours: Bool
  @State private var includeDealsAndMenu: Bool
  @State private var includePhotos: Bool
  @State private var includeLocation = true
  @State private var selectedDealIds: Set<Int>
  @State private var selectedPhotoUri: String?
  @State private var validationMessage: String?

  init(
    context: DiningDealzPlannerContext,
    onComplete: @escaping (DiningDealzNativeShareSelection) -> Void,
    onCancel: @escaping () -> Void
  ) {
    self.context = context
    self.onComplete = onComplete
    self.onCancel = onCancel
    let hasHappyHours = context.schedules.contains { $0.kind == "happy-hour" }
    let hasOperatingHours = context.schedules.contains { $0.kind == "operating-hours" }
    _includeHappyHours = State(initialValue: hasHappyHours)
    _includeOperatingHours = State(initialValue: hasOperatingHours)
    _includeDealsAndMenu = State(initialValue: !context.deals.isEmpty)
    _includePhotos = State(initialValue: !context.imageUrls.isEmpty)
    _selectedDealIds = State(initialValue: Set(context.deals.map(\.id)))
    _selectedPhotoUri = State(initialValue: context.imageUrls.first)
    _date = State(initialValue: diningDealzPlannerDateString(diningDealzPlannerDate(for: context.schedules.first, timeZone: context.timeZone), timeZone: context.timeZone))
    if let schedule = context.schedules.first {
      _startTime = State(initialValue: schedule.startTime)
      _endTime = State(initialValue: schedule.endTime)
    }
  }

  var body: some View {
    NavigationView {
      ScrollView {
        VStack(alignment: .leading, spacing: 15) {
          Picker("Share mode", selection: $mode) {
            Text("Share my time").tag("my-time")
            Text("Restaurant details").tag("restaurant-details")
          }
          .pickerStyle(.segmented)

          if mode == "my-time" {
            TextField("Date (YYYY-MM-DD)", text: $date)
              .textFieldStyle(.roundedBorder)
            HStack {
              TextField("Start (15:00)", text: $startTime)
                .textFieldStyle(.roundedBorder)
              TextField("End (18:00)", text: $endTime)
                .textFieldStyle(.roundedBorder)
            }
          } else {
            Text("Choose the details your friend should receive. The business name and DiningDealz branding are always included.")
              .font(.footnote)
              .foregroundStyle(DiningDealzPlannerPalette.muted)
          }

          Text("Include")
            .font(.headline)
            .foregroundStyle(.white)
          Toggle("Happy hours and specials", isOn: $includeHappyHours).tint(DiningDealzPlannerPalette.accent)
          Toggle("Hours of operation", isOn: $includeOperatingHours).tint(DiningDealzPlannerPalette.accent)
          Toggle("Deals and menu text", isOn: $includeDealsAndMenu).tint(DiningDealzPlannerPalette.accent)
          Toggle("Location and map link", isOn: $includeLocation).tint(DiningDealzPlannerPalette.accent)
          if !context.imageUrls.isEmpty {
            Toggle("Photo", isOn: $includePhotos).tint(DiningDealzPlannerPalette.accent)
          }
          if includePhotos && context.imageUrls.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
              Text("Photo to share")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                  ForEach(context.imageUrls, id: \.self) { uri in
                    Button {
                      selectedPhotoUri = uri
                    } label: {
                      AsyncImage(url: URL(string: uri)) { phase in
                        if let image = phase.image {
                          image.resizable().scaledToFill()
                        } else {
                          ZStack {
                            Color(red: 0.15, green: 0.20, blue: 0.18)
                            Image(systemName: diningDealzPlannerCategoryIcon(context.venueTypeLabel))
                              .foregroundStyle(DiningDealzPlannerPalette.muted)
                          }
                        }
                      }
                      .frame(width: 88, height: 68)
                      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                      .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                          .stroke(selectedPhotoUri == uri ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border, lineWidth: selectedPhotoUri == uri ? 2 : 1)
                      )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Use photo")
                  }
                }
                .padding(.vertical, 2)
              }
            }
          }

          if mode == "restaurant-details" && !context.deals.isEmpty {
            Text("Deals to include")
              .font(.subheadline.weight(.bold))
              .foregroundStyle(.white)
            ForEach(context.deals) { deal in
              Button {
                if selectedDealIds.contains(deal.id) {
                  selectedDealIds.remove(deal.id)
                } else {
                  selectedDealIds.insert(deal.id)
                }
              } label: {
                Label(deal.title, systemImage: selectedDealIds.contains(deal.id) ? "checkmark.square.fill" : "square")
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .buttonStyle(.plain)
              .foregroundStyle(selectedDealIds.contains(deal.id) ? DiningDealzPlannerPalette.accent : .white)
            }
          }

          DiningDealzNativeShareCardView(context: context, selection: nativeSelection)
            .frame(maxWidth: .infinity)

          if let validationMessage {
            Text(validationMessage)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.red)
          }
          Text("Your device opens the share sheet. DiningDealz never sends a message automatically.")
            .font(.footnote)
            .foregroundStyle(DiningDealzPlannerPalette.muted)
          Button("Open Share Sheet") {
            submit()
          }
          .buttonStyle(.borderedProminent)
          .tint(DiningDealzPlannerPalette.accent)
          .frame(maxWidth: .infinity)
        }
        .padding(20)
      }
      .background(DiningDealzPlannerPalette.background)
      .navigationTitle("Share Restaurant")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
      }
    }
    .preferredColorScheme(.dark)
  }

  private var nativeSelection: DiningDealzNativeShareSelection {
    DiningDealzNativeShareSelection(
      mode: mode,
      date: mode == "my-time" ? date : nil,
      startTime: mode == "my-time" ? startTime : nil,
      endTime: mode == "my-time" ? endTime : nil,
      includeHappyHours: includeHappyHours,
      includeOperatingHours: includeOperatingHours,
      includeDealsAndMenu: includeDealsAndMenu,
      includePhotos: includePhotos,
      includeLocation: includeLocation,
      selectedDealIds: Array(selectedDealIds).sorted(),
      selectedPhotoUri: includePhotos ? selectedPhotoUri : nil
    )
  }

  private func submit() {
    if mode == "my-time" {
      guard !date.isEmpty, !startTime.isEmpty, !endTime.isEmpty else {
        validationMessage = "Enter a date, start time, and end time."
        return
      }
    }
    if !includeHappyHours && !includeOperatingHours && !includeDealsAndMenu && !includePhotos && !includeLocation {
      validationMessage = "Select at least one detail to share."
      return
    }
    onComplete(nativeSelection)
  }
}

struct DiningDealzNativeShareCardView: View {
  let context: DiningDealzPlannerContext
  let selection: DiningDealzNativeShareSelection
  let photoImage: Image?

  init(
    context: DiningDealzPlannerContext,
    selection: DiningDealzNativeShareSelection,
    photoImage: Image? = nil
  ) {
    self.context = context
    self.selection = selection
    self.photoImage = photoImage
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Image("DiningDealzLogo")
          .resizable()
          .scaledToFit()
          .frame(width: 34, height: 34)
        Text("DiningDealz")
          .font(.caption.weight(.bold))
          .foregroundStyle(DiningDealzPlannerPalette.accent)
      }
      if let photoImage, selection.includePhotos {
        photoImage
          .resizable()
          .scaledToFill()
          .frame(height: 120)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      } else if let uri = selection.selectedPhotoUri, let url = URL(string: uri), selection.includePhotos {
        AsyncImage(url: url) { phase in
          if let image = phase.image {
            image.resizable().scaledToFill()
          } else {
            placeholder
          }
        }
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      } else {
        placeholder
          .frame(height: 120)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      Text(context.name)
        .font(.title3.weight(.bold))
        .foregroundStyle(.white)
      Text([context.cityLabel, context.venueTypeLabel].filter { !$0.isEmpty }.joined(separator: " · "))
        .font(.caption)
        .foregroundStyle(DiningDealzPlannerPalette.muted)
      if selection.mode == "my-time" {
        Text([selection.date, selection.startTime.map(diningDealzPlannerDisplayTime), selection.endTime.map(diningDealzPlannerDisplayTime)].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
      } else {
        Text(nativeShareCardDetails)
          .font(.caption)
          .foregroundStyle(.white.opacity(0.88))
          .lineLimit(5)
      }
    }
    .padding(14)
    .background(DiningDealzPlannerPalette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DiningDealzPlannerPalette.border, lineWidth: 1))
  }

  private var placeholder: some View {
    ZStack {
      Color(red: 0.15, green: 0.20, blue: 0.18)
      Image(systemName: diningDealzPlannerCategoryIcon(context.venueTypeLabel))
        .font(.system(size: 38, weight: .medium))
        .foregroundStyle(DiningDealzPlannerPalette.accent)
    }
  }

  private var nativeShareCardDetails: String {
    [
      selection.includeHappyHours ? "Happy hours and specials" : nil,
      selection.includeOperatingHours ? "Hours of operation" : nil,
      selection.includeDealsAndMenu ? context.deals.filter { selection.selectedDealIds.contains($0.id) }.map(\.title).joined(separator: ", ") : nil,
      selection.includeLocation ? context.address : nil,
    ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n")
  }
}

private func diningDealzPlannerCalendar(timeZone: String) -> Calendar {
  var calendar = Calendar.autoupdatingCurrent
  calendar.timeZone = TimeZone(identifier: timeZone) ?? .autoupdatingCurrent
  return calendar
}

private func diningDealzPlannerDate(for schedule: DiningDealzPlannerSchedule?, timeZone: String) -> Date {
  let calendar = diningDealzPlannerCalendar(timeZone: timeZone)
  let today = calendar.startOfDay(for: Date())
  guard let weekday = schedule?.weekday else { return today }
  let currentWeekday = (calendar.component(.weekday, from: today) + 5) % 7
  let offset = (weekday - currentWeekday + 7) % 7
  return calendar.date(byAdding: .day, value: offset, to: today) ?? today
}

private func diningDealzPlannerTime(on date: Date, value: String, nextDay: Bool = false, timeZone: String) -> Date {
  let calendar = diningDealzPlannerCalendar(timeZone: timeZone)
  let parts = value.split(separator: ":").compactMap { Int($0) }
  var result = calendar.date(bySettingHour: parts.first ?? 0, minute: parts.dropFirst().first ?? 0, second: 0, of: date) ?? date
  if nextDay {
    result = calendar.date(byAdding: .day, value: 1, to: result) ?? result
  }
  return result
}

private func diningDealzPlannerDateWithTime(on date: Date, from time: Date, timeZone: String) -> Date {
  let calendar = diningDealzPlannerCalendar(timeZone: timeZone)
  return calendar.date(
    bySettingHour: calendar.component(.hour, from: time),
    minute: calendar.component(.minute, from: time),
    second: 0,
    of: date
  ) ?? date
}

private func diningDealzPlannerIsOvernight(start: String, end: String) -> Bool {
  let startParts = start.split(separator: ":").compactMap { Int($0) }
  let endParts = end.split(separator: ":").compactMap { Int($0) }
  let startMinutes = (startParts.first ?? 0) * 60 + (startParts.dropFirst().first ?? 0)
  let endMinutes = (endParts.first ?? 0) * 60 + (endParts.dropFirst().first ?? 0)
  return endMinutes <= startMinutes
}

private func diningDealzPlannerDateString(_ date: Date, timeZone: String) -> String {
  let formatter = DateFormatter()
  formatter.timeZone = TimeZone(identifier: timeZone) ?? .autoupdatingCurrent
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: date)
}

private func diningDealzPlannerDisplayTime(_ value: String) -> String {
  let parts = value.split(separator: ":").compactMap { Int($0) }
  guard let hour = parts.first, let minute = parts.dropFirst().first else { return value }
  let formatter = DateFormatter()
  formatter.dateFormat = "h:mm a"
  return formatter.string(from: diningDealzPlannerTime(on: Date(), value: "\(hour):\(minute)", timeZone: TimeZone.autoupdatingCurrent.identifier))
}

private func diningDealzPlannerCategoryIcon(_ label: String) -> String {
  let normalized = label.lowercased()
  if normalized.contains("cafe") || normalized.contains("coffee") { return "cup.and.saucer.fill" }
  if normalized.contains("bar") || normalized.contains("wine") { return "wineglass.fill" }
  if normalized.contains("shop") || normalized.contains("store") { return "storefront.fill" }
  if normalized.contains("mobile") || normalized.contains("vendor") { return "bus.fill" }
  if normalized.contains("attraction") { return "star.fill" }
  return "fork.knife"
}

private func diningDealzPlannerNotes(context: DiningDealzPlannerContext, schedule: DiningDealzPlannerSchedule?) -> String {
  let scheduleNote = schedule.map { schedule in
    let timeNote = schedule.allDay
      ? "All day"
      : diningDealzPlannerDisplayTime(schedule.startTime) + " - " + diningDealzPlannerDisplayTime(schedule.endTime)
    return schedule.label + " · " + timeNote
  }
  return [
    "DiningDealz",
    scheduleNote,
    context.address.isEmpty ? nil : "Location: \(context.address)",
    diningDealzPlannerMapURL(context),
  ].compactMap { $0 }.joined(separator: "\n")
}

private func diningDealzPlannerMapURL(_ context: DiningDealzPlannerContext) -> String? {
  if let latitude = context.latitude, let longitude = context.longitude {
    return "https://www.google.com/maps/search/?api=1&query=\(latitude),\(longitude)"
  }
  guard !context.address.isEmpty else { return nil }
  let query = "\(context.name), \(context.address)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
  return "https://www.google.com/maps/search/?api=1&query=\(query)"
}

private func scheduleSummary(_ schedule: DiningDealzPlannerSchedule) -> String {
  let day = schedule.weekdayLabel.map { "\($0) · " } ?? ""
  if schedule.allDay { return "\(day)All day" }
  return "\(day)\(diningDealzPlannerDisplayTime(schedule.startTime)) - \(diningDealzPlannerDisplayTime(schedule.endTime))"
}
