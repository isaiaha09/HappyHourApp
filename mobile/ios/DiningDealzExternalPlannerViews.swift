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
  let theme: String?
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
  static let accent = Color(red: 1.0, green: 0.34, blue: 0.38)

  static func background(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color(red: 0.065, green: 0.085, blue: 0.105)
      : Color(red: 0.965, green: 0.975, blue: 0.968)
  }

  static func card(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color(red: 0.12, green: 0.15, blue: 0.17)
      : Color.white
  }

  static func border(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color(red: 0.24, green: 0.29, blue: 0.32)
      : Color(red: 0.79, green: 0.83, blue: 0.80)
  }

  static func foreground(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color.white.opacity(0.96)
      : Color(red: 0.10, green: 0.13, blue: 0.11)
  }

  static func muted(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color.white.opacity(0.68)
      : Color(red: 0.34, green: 0.39, blue: 0.36)
  }

  static func placeholder(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark
      ? Color(red: 0.15, green: 0.20, blue: 0.18)
      : Color(red: 0.89, green: 0.93, blue: 0.90)
  }
}

private func diningDealzPlannerColorScheme(_ theme: String?) -> ColorScheme? {
  switch theme?.lowercased() {
  case "dark": return .dark
  case "light": return .light
  default: return nil
  }
}

struct DiningDealzCalendarComposerView: View {
  let context: DiningDealzPlannerContext
  let onComplete: (DiningDealzNativeCalendarDraft) -> Void
  let onCancel: () -> Void

  @Environment(\.colorScheme) private var colorScheme

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
            .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))

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
                    .foregroundStyle(DiningDealzPlannerPalette.muted(for: colorScheme))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(selectedScheduleID == schedule.id ? DiningDealzPlannerPalette.accent.opacity(0.22) : DiningDealzPlannerPalette.card(for: colorScheme), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(selectedScheduleID == schedule.id ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border(for: colorScheme), lineWidth: 1))
              }
              .buttonStyle(.plain)
              .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
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
          .tint(selectedScheduleID == nil ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border(for: colorScheme))

          DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
            .datePickerStyle(.compact)
            .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
          DatePicker("Start", selection: $startDate, displayedComponents: .hourAndMinute)
            .datePickerStyle(.compact)
            .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
            .disabled(allDay)
          DatePicker("End", selection: $endDate, displayedComponents: .hourAndMinute)
            .datePickerStyle(.compact)
            .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
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
            .foregroundStyle(DiningDealzPlannerPalette.muted(for: colorScheme))

          Button("Open Calendar") {
            submit()
          }
          .buttonStyle(.borderedProminent)
          .tint(DiningDealzPlannerPalette.accent)
          .frame(maxWidth: .infinity)
        }
        .padding(20)
      }
      .background(DiningDealzPlannerPalette.background(for: colorScheme))
      .navigationTitle("Add to Calendar")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
      }
    }
    .environment(\.timeZone, TimeZone(identifier: context.timeZone) ?? .autoupdatingCurrent)
    .environment(\.locale, Locale(identifier: "en_US"))
    .preferredColorScheme(diningDealzPlannerColorScheme(context.theme))
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

  @Environment(\.colorScheme) private var colorScheme

  @State private var mode = "restaurant-details"
  @State private var selectedDate: Date
  @State private var selectedStartTime: Date
  @State private var selectedEndTime: Date
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
    let schedule = context.schedules.first
    let initialDate = diningDealzPlannerDate(for: schedule, timeZone: context.timeZone)
    let initialStart = diningDealzPlannerTime(on: initialDate, value: schedule?.startTime ?? "09:00", timeZone: context.timeZone)
    let initialEnd = diningDealzPlannerTime(on: initialDate, value: schedule?.endTime ?? "10:00", nextDay: schedule.map { diningDealzPlannerIsOvernight(start: $0.startTime, end: $0.endTime) } ?? false, timeZone: context.timeZone)
    _selectedDate = State(initialValue: initialDate)
    _selectedStartTime = State(initialValue: initialStart)
    _selectedEndTime = State(initialValue: initialEnd)
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
            VStack(alignment: .leading, spacing: 10) {
              Text("Your availability")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
              DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                .datePickerStyle(.compact)
                .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
              DatePicker("Start", selection: $selectedStartTime, displayedComponents: .hourAndMinute)
                .datePickerStyle(.compact)
                .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
              DatePicker("End", selection: $selectedEndTime, displayedComponents: .hourAndMinute)
                .datePickerStyle(.compact)
                .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
            }
          } else {
            Text("Choose the details your friend should receive. The business name and DiningDealz branding are always included.")
              .font(.footnote)
              .foregroundStyle(DiningDealzPlannerPalette.muted(for: colorScheme))
          }

          Text("Include")
            .font(.headline)
            .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
          Toggle("Happy Hours and Deals", isOn: $includeHappyHours).tint(DiningDealzPlannerPalette.accent)
          Toggle("Hours of operation", isOn: $includeOperatingHours).tint(DiningDealzPlannerPalette.accent)
          Toggle("Specials and Menu", isOn: $includeDealsAndMenu).tint(DiningDealzPlannerPalette.accent)
          Toggle("Location and map link", isOn: $includeLocation).tint(DiningDealzPlannerPalette.accent)
          if !context.imageUrls.isEmpty {
            Toggle("Photo", isOn: $includePhotos).tint(DiningDealzPlannerPalette.accent)
          }
          if includePhotos && context.imageUrls.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
              Text("Photo to share")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
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
                            DiningDealzPlannerPalette.placeholder(for: colorScheme)
                            Image(systemName: diningDealzPlannerCategoryIcon(context.venueTypeLabel))
                              .foregroundStyle(DiningDealzPlannerPalette.muted(for: colorScheme))
                          }
                        }
                      }
                      .frame(width: 88, height: 68)
                      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                      .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                          .stroke(selectedPhotoUri == uri ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.border(for: colorScheme), lineWidth: selectedPhotoUri == uri ? 2 : 1)
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
            Text("Specials and Menu to include")
              .font(.subheadline.weight(.bold))
              .foregroundStyle(DiningDealzPlannerPalette.foreground(for: colorScheme))
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
              .foregroundStyle(selectedDealIds.contains(deal.id) ? DiningDealzPlannerPalette.accent : DiningDealzPlannerPalette.foreground(for: colorScheme))
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
            .foregroundStyle(DiningDealzPlannerPalette.muted(for: colorScheme))
          Button("Open Share Sheet") {
            submit()
          }
          .buttonStyle(.borderedProminent)
          .tint(DiningDealzPlannerPalette.accent)
          .frame(maxWidth: .infinity)
        }
        .padding(20)
      }
      .background(DiningDealzPlannerPalette.background(for: colorScheme))
      .navigationTitle("Share Restaurant")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
      }
    }
    .environment(\.timeZone, TimeZone(identifier: context.timeZone) ?? .autoupdatingCurrent)
    .environment(\.locale, Locale(identifier: "en_US"))
    .preferredColorScheme(diningDealzPlannerColorScheme(context.theme))
  }

  private var nativeSelection: DiningDealzNativeShareSelection {
    let date = diningDealzPlannerDateString(selectedDate, timeZone: context.timeZone)
    let startTime = diningDealzPlanner24HourTime(from: selectedStartTime, timeZone: context.timeZone)
    let endTime = diningDealzPlanner24HourTime(from: selectedEndTime, timeZone: context.timeZone)

    return DiningDealzNativeShareSelection(
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
      let normalizedStart = diningDealzPlanner24HourTime(from: selectedStartTime, timeZone: context.timeZone)
      let normalizedEnd = diningDealzPlanner24HourTime(from: selectedEndTime, timeZone: context.timeZone)
      if normalizedStart == normalizedEnd {
        validationMessage = "Start and end times cannot be the same."
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

  @Environment(\.colorScheme) private var colorScheme

  private var resolvedColorScheme: ColorScheme {
    diningDealzPlannerColorScheme(context.theme) ?? colorScheme
  }

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
        .foregroundStyle(DiningDealzPlannerPalette.foreground(for: resolvedColorScheme))
      Text([context.cityLabel, context.venueTypeLabel].filter { !$0.isEmpty }.joined(separator: " · "))
        .font(.caption)
        .foregroundStyle(DiningDealzPlannerPalette.muted(for: resolvedColorScheme))
      Text(nativeShareCardDetails)
        .font(.caption)
        .foregroundStyle(DiningDealzPlannerPalette.foreground(for: resolvedColorScheme).opacity(0.88))
    }
    .padding(14)
    .background(DiningDealzPlannerPalette.card(for: resolvedColorScheme), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DiningDealzPlannerPalette.border(for: resolvedColorScheme), lineWidth: 1))
  }

  private var placeholder: some View {
    ZStack {
      DiningDealzPlannerPalette.placeholder(for: resolvedColorScheme)
      Image(systemName: diningDealzPlannerCategoryIcon(context.venueTypeLabel))
        .font(.system(size: 38, weight: .medium))
        .foregroundStyle(DiningDealzPlannerPalette.accent)
    }
  }

  private var nativeShareCardDetails: String {
    var lines: [String] = []
    if selection.mode == "my-time" {
      let date = selection.date.map(diningDealzPlannerDisplayDate) ?? ""
      let start = selection.startTime.map(diningDealzPlannerDisplayTime) ?? ""
      let end = selection.endTime.map(diningDealzPlannerDisplayTime) ?? ""
      let range = [start, end].filter { !$0.isEmpty }.joined(separator: " - ")
      let details = [date, range].filter { !$0.isEmpty }.joined(separator: " · ")
      if !details.isEmpty {
        lines.append("My time: \(details)")
      }
    }

    let counts = diningDealzPlannerContentCounts(context)
    let selectedDeals = context.deals.filter { selection.selectedDealIds.contains($0.id) }
    let titles = diningDealzPlannerContentTitles(context)
    let operatingHours = diningDealzPlannerOperatingHoursText(context)
    lines.append(contentsOf: [
      selection.includeHappyHours && counts.happyHourSpecials > 0 ? diningDealzPlannerContentSummary(
        label: "Happy Hours and Deals",
        count: counts.happyHourSpecials,
        singular: "special",
        titles: titles.happyHourTitles
      ) : nil,
      selection.includeOperatingHours && !operatingHours.isEmpty ? "Hours of operation: \(operatingHours)" : nil,
      selection.includeDealsAndMenu && !selectedDeals.isEmpty ? diningDealzPlannerContentSummary(
        label: "Specials and Menu",
        count: selectedDeals.count,
        singular: "deal",
        titles: selectedDeals.compactMap { $0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0.title.trimmingCharacters(in: .whitespacesAndNewlines) }
      ) : nil,
      selection.includeLocation ? context.address : nil,
    ].compactMap { $0 }.filter { !$0.isEmpty })
    return lines.joined(separator: "\n")
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

private func diningDealzPlanner24HourTime(from date: Date, timeZone: String) -> String {
  let calendar = diningDealzPlannerCalendar(timeZone: timeZone)
  return String(
    format: "%02d:%02d",
    calendar.component(.hour, from: date),
    calendar.component(.minute, from: date)
  )
}

private func diningDealzPlannerDisplayDate(_ value: String) -> String {
  let parts = value.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "-")
  guard parts.count == 3 else { return value }
  if parts[0].count == 4 {
    return String(format: "%02d-%02d-%04d", Int(parts[1]) ?? 0, Int(parts[2]) ?? 0, Int(parts[0]) ?? 0)
  }
  guard parts[2].count == 4 else { return value }
  return String(format: "%02d-%02d-%04d", Int(parts[0]) ?? 0, Int(parts[1]) ?? 0, Int(parts[2]) ?? 0)
}

private func diningDealzPlannerISODate(from value: String) -> String? {
  let parts = value.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "-")
  guard parts.count == 3 else { return nil }

  let year: Int
  let month: Int
  let day: Int
  if parts[0].count == 4 {
    year = Int(parts[0]) ?? 0
    month = Int(parts[1]) ?? 0
    day = Int(parts[2]) ?? 0
  } else {
    month = Int(parts[0]) ?? 0
    day = Int(parts[1]) ?? 0
    year = Int(parts[2]) ?? 0
  }

  guard year >= 1, (1...12).contains(month), (1...31).contains(day) else { return nil }
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .autoupdatingCurrent
  let components = DateComponents(year: year, month: month, day: day)
  guard let date = calendar.date(from: components),
        calendar.component(.year, from: date) == year,
        calendar.component(.month, from: date) == month,
        calendar.component(.day, from: date) == day else {
    return nil
  }
  return String(format: "%04d-%02d-%02d", year, month, day)
}

private func diningDealzPlanner24HourTime(from value: String) -> String? {
  let normalizedValue = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
  let attachedSuffix = normalizedValue.hasSuffix("AM") || normalizedValue.hasSuffix("PM")
    ? String(normalizedValue.suffix(2))
    : nil
  let valueWithoutAttachedSuffix = attachedSuffix == nil
    ? normalizedValue
    : String(normalizedValue.dropLast(2)).trimmingCharacters(in: .whitespacesAndNewlines)
  let tokens = valueWithoutAttachedSuffix.split { $0 == " " || $0 == "\t" }
  guard let timeToken = tokens.first else { return nil }
  let timeParts = timeToken.split(separator: ":")
  guard timeParts.count >= 2,
        let rawHour = Int(timeParts[0]),
        let minute = Int(timeParts[1]),
        (0...59).contains(minute) else {
    return nil
  }

  let suffix = attachedSuffix ?? tokens.dropFirst().first.map { String($0).uppercased() }
  let hour: Int
  if suffix == "AM" || suffix == "PM" {
    guard (1...12).contains(rawHour) else { return nil }
    hour = (rawHour % 12) + (suffix == "PM" ? 12 : 0)
  } else {
    guard (0...23).contains(rawHour) else { return nil }
    hour = rawHour
  }
  return String(format: "%02d:%02d", hour, minute)
}

private func diningDealzPlannerDisplayTime(_ value: String) -> String {
  guard let normalized = diningDealzPlanner24HourTime(from: value) else { return value }
  let parts = normalized.split(separator: ":").compactMap { Int($0) }
  guard let hour = parts.first, let minute = parts.dropFirst().first else { return value }
  return "\(hour % 12 == 0 ? 12 : hour % 12):\(String(format: "%02d", minute)) \(hour >= 12 ? "PM" : "AM")"
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
  let counts = diningDealzPlannerContentCounts(context)
  let titles = diningDealzPlannerContentTitles(context)
  let operatingHours = diningDealzPlannerOperatingHoursText(context)
  return [
    "DiningDealz",
    counts.happyHourSpecials > 0 ? diningDealzPlannerContentSummary(
      label: "Happy Hours and Deals",
      count: counts.happyHourSpecials,
      singular: "special",
      titles: titles.happyHourTitles
    ) : nil,
    operatingHours.isEmpty ? nil : "Hours of operation: \(operatingHours)",
    context.deals.isEmpty ? nil : diningDealzPlannerContentSummary(
      label: "Specials and Menu",
      count: context.deals.count,
      singular: "deal",
      titles: titles.dealTitles
    ),
    context.address.isEmpty ? nil : "Location: \(context.address)",
    diningDealzPlannerMapURL(context),
  ].compactMap { $0 }.joined(separator: "\n")
}

private func diningDealzPlannerContentCounts(_ context: DiningDealzPlannerContext) -> (happyHourSpecials: Int, operatingHourSchedules: Int) {
  let happyHourSchedules = context.schedules.filter { $0.kind == "happy-hour" }
  let knownDealIDs = Set(happyHourSchedules.compactMap(\.dealId))
  let schedulesWithoutDeal = happyHourSchedules.filter { $0.dealId == nil }.count
  return (
    happyHourSpecials: knownDealIDs.count + schedulesWithoutDeal,
    operatingHourSchedules: context.schedules.filter { $0.kind == "operating-hours" }.count
  )
}

private func diningDealzPlannerCountLabel(_ count: Int, singular: String) -> String {
  "\(count) \(count == 1 ? singular : singular + "s")"
}

private func diningDealzPlannerContentSummary(label: String, count: Int, singular: String, titles: [String]) -> String {
  let titleSuffix = titles.isEmpty ? "" : " — \(titles.joined(separator: ", "))"
  return "\(label): \(diningDealzPlannerCountLabel(count, singular: singular))\(titleSuffix)"
}

private func diningDealzPlannerContentTitles(_ context: DiningDealzPlannerContext) -> (happyHourTitles: [String], dealTitles: [String]) {
  func uniqueTitles(_ values: [String?]) -> [String] {
    var seen = Set<String>()
    return values.compactMap { value in
      let title = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !title.isEmpty, !seen.contains(title) else { return nil }
      seen.insert(title)
      return title
    }
  }

  let happyHourSchedules = context.schedules.filter { $0.kind == "happy-hour" }
    + context.deals.flatMap { $0.happyHours }

  return (
    happyHourTitles: uniqueTitles(happyHourSchedules.map { schedule in
      if let title = schedule.dealTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
        return title
      }
      let fallback = schedule.label.trimmingCharacters(in: .whitespacesAndNewlines)
      return fallback.isEmpty || fallback.lowercased() == "happy hour" ? nil : fallback
    }),
    dealTitles: uniqueTitles(context.deals.map { Optional($0.title) })
  )
}

private func diningDealzPlannerOperatingHoursText(_ context: DiningDealzPlannerContext) -> String {
  context.schedules
    .filter { $0.kind == "operating-hours" }
    .map { schedule in
      let day = schedule.weekdayLabel.map { "\($0): " } ?? ""
      if schedule.allDay {
        return "\(day)Open 24 hours"
      }
      let start = diningDealzPlannerDisplayTime(schedule.startTime)
      let end = diningDealzPlannerDisplayTime(schedule.endTime)
      let range = [start, end].filter { !$0.isEmpty }.joined(separator: " - ")
      return "\(day)\(range.isEmpty ? schedule.label : range)"
    }
    .filter { !$0.isEmpty }
    .joined(separator: "; ")
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
