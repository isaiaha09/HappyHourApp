import EventKit
import EventKitUI
import Foundation
import React
import SwiftUI
import UIKit

private final class DiningDealzEventEditorDelegate: NSObject, EKEventEditViewDelegate {
  let completion: (EKEventEditViewAction) -> Void

  init(completion: @escaping (EKEventEditViewAction) -> Void) {
    self.completion = completion
  }

  func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
    completion(action)
  }
}

@objc(DiningDealzExternalPlanner)
final class DiningDealzExternalPlanner: NSObject {
  private var eventEditorDelegate: DiningDealzEventEditorDelegate?

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(presentCalendarComposer:resolver:rejecter:)
  func presentCalendarComposer(
    _ payload: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let context = decodeContext(payload as String) else {
      reject("invalid_context", "The restaurant information could not be loaded.", nil)
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self, let presenter = Self.topViewController() else {
        reject("presentation_unavailable", "The calendar composer is unavailable right now.", nil)
        return
      }

      var hostingController: UIViewController?
      let rootView = DiningDealzCalendarComposerView(
        context: context,
        onComplete: { [weak self] draft in
          hostingController?.dismiss(animated: true) {
            self?.presentCalendarEvent(draft, from: presenter, resolve: resolve, reject: reject)
          }
        },
        onCancel: {
          hostingController?.dismiss(animated: true) {
            resolve(["cancelled": true])
          }
        }
      )
      let controller = UIHostingController(rootView: rootView)
      hostingController = controller
      controller.modalPresentationStyle = .pageSheet
      presenter.present(controller, animated: true)
    }
  }

  @objc(presentShareComposer:resolver:rejecter:)
  func presentShareComposer(
    _ payload: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let context = decodeContext(payload as String) else {
      reject("invalid_context", "The restaurant information could not be loaded.", nil)
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self, let presenter = Self.topViewController() else {
        reject("presentation_unavailable", "The share composer is unavailable right now.", nil)
        return
      }

      var hostingController: UIViewController?
      let rootView = DiningDealzShareComposerView(
        context: context,
        onComplete: { [weak self] selection in
          hostingController?.dismiss(animated: true) {
            DispatchQueue.main.async { @MainActor [weak self] in
              self?.presentShareSheet(context: context, selection: selection, from: presenter, resolve: resolve, reject: reject)
            }
          }
        },
        onCancel: {
          hostingController?.dismiss(animated: true) {
            resolve(["cancelled": true])
          }
        }
      )
      let controller = UIHostingController(rootView: rootView)
      hostingController = controller
      controller.modalPresentationStyle = .pageSheet
      presenter.present(controller, animated: true)
    }
  }

  private func decodeContext(_ payload: String) -> DiningDealzPlannerContext? {
    guard let data = payload.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(DiningDealzPlannerContext.self, from: data)
  }

  private func presentCalendarEvent(
    _ draft: DiningDealzNativeCalendarDraft,
    from presenter: UIViewController,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let eventStore = EKEventStore()
    requestCalendarAccess(eventStore) { [weak self] granted in
      DispatchQueue.main.async {
        guard granted else {
          self?.presentCalendarICSFallback(draft, from: presenter, resolve: resolve, reject: reject)
          return
        }

        let event = EKEvent(eventStore: eventStore)
        event.title = draft.title
        event.startDate = draft.startAt
        event.endDate = draft.endAt
        event.timeZone = TimeZone(identifier: draft.timeZone) ?? .autoupdatingCurrent
        event.location = draft.location
        event.notes = draft.notes
        event.calendar = eventStore.defaultCalendarForNewEvents
        if draft.weeklyRepeat {
          event.addRecurrenceRule(EKRecurrenceRule(recurrenceWith: .weekly, interval: 1, end: nil))
        }

        let editor = EKEventEditViewController()
        editor.eventStore = eventStore
        editor.event = event
        let delegate = DiningDealzEventEditorDelegate { [weak self, weak editor] action in
          let cancelled = action == .canceled
          editor?.dismiss(animated: true) {
            self?.eventEditorDelegate = nil
            resolve(["cancelled": cancelled])
          }
        }
        self?.eventEditorDelegate = delegate
        editor.editViewDelegate = delegate
        presenter.present(editor, animated: true)
      }
    }
  }

  private func requestCalendarAccess(_ eventStore: EKEventStore, completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      switch EKEventStore.authorizationStatus(for: .event) {
      case .fullAccess, .writeOnly:
        completion(true)
      case .notDetermined:
        eventStore.requestFullAccessToEvents { granted, _ in completion(granted) }
      default:
        completion(false)
      }
      return
    }

    switch EKEventStore.authorizationStatus(for: .event) {
    case .authorized:
      completion(true)
    case .notDetermined:
      eventStore.requestAccess(to: .event) { granted, _ in completion(granted) }
    default:
      completion(false)
    }
  }

  private func presentCalendarICSFallback(
    _ draft: DiningDealzNativeCalendarDraft,
    from presenter: UIViewController,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("diningdealz-\(UUID().uuidString).ics")
    do {
      try diningDealzICSData(for: draft).write(to: fileURL, options: .atomic)
      let controller = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
      configurePopover(controller, source: presenter.view)
      controller.completionWithItemsHandler = { _, completed, _, error in
        if let error {
          reject("calendar_fallback_failed", error.localizedDescription, error)
        } else {
          resolve(["cancelled": !completed, "usedIcsFallback": true])
        }
      }
      presenter.present(controller, animated: true)
    } catch {
      reject("calendar_fallback_failed", error.localizedDescription, error)
    }
  }

  @MainActor
  private func presentShareSheet(
    context: DiningDealzPlannerContext,
    selection: DiningDealzNativeShareSelection,
    from presenter: UIViewController,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let message = diningDealzShareText(context: context, selection: selection)
    let presentSheet: @MainActor (UIImage?) -> Void = { [weak self] photo in
      guard let self else { return }
      let image = self.diningDealzRenderShareCard(context: context, selection: selection, photo: photo)
      let mapURL = selection.includeLocation
        ? diningDealzPlannerMapURL(context).flatMap(URL.init(string:))
        : nil
      var items: [Any] = [message]
      if let image { items.append(image) }
      if let mapURL { items.append(mapURL) }

      let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
      self.configurePopover(controller, source: presenter.view)
      controller.completionWithItemsHandler = { _, completed, _, error in
        if let error {
          reject("share_failed", error.localizedDescription, error)
        } else {
          resolve(["cancelled": !completed])
        }
      }
      presenter.present(controller, animated: true)
    }

    guard selection.includePhotos,
          let uri = selection.selectedPhotoUri,
          let url = URL(string: uri),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https" else {
      presentSheet(nil)
      return
    }

    URLSession.shared.dataTask(with: url) { data, _, _ in
      Task { @MainActor in
        presentSheet(data.flatMap(UIImage.init(data:)))
      }
    }.resume()
  }

  @MainActor
  private func diningDealzRenderShareCard(
    context: DiningDealzPlannerContext,
    selection: DiningDealzNativeShareSelection,
    photo: UIImage? = nil
  ) -> UIImage? {
    let card = DiningDealzNativeShareCardView(
      context: context,
      selection: selection,
      photoImage: photo.map { Image(uiImage: $0) }
    )
      .frame(width: 360)
      .padding(1)

    if #available(iOS 16.0, *) {
      let renderer = ImageRenderer(content: card)
      renderer.scale = UIScreen.main.scale
      return renderer.uiImage
    }

    let controller = UIHostingController(rootView: card)
    let size = CGSize(width: 362, height: 420)
    controller.view.bounds = CGRect(origin: .zero, size: size)
    controller.view.backgroundColor = .clear
    controller.view.layoutIfNeeded()
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true)
    }
  }

  private func configurePopover(_ controller: UIViewController, source: UIView) {
    guard let popover = controller.popoverPresentationController else { return }
    popover.sourceView = source
    popover.sourceRect = CGRect(x: source.bounds.midX, y: source.bounds.maxY - 1, width: 1, height: 1)
    popover.permittedArrowDirections = []
  }

  private static func topViewController() -> UIViewController? {
    let windowScene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    let root = windowScene?.windows.first { $0.isKeyWindow }?.rootViewController
    return topViewController(from: root)
  }

  private static func topViewController(from controller: UIViewController?) -> UIViewController? {
    if let presented = controller?.presentedViewController {
      return topViewController(from: presented)
    }
    if let navigation = controller as? UINavigationController {
      return topViewController(from: navigation.visibleViewController)
    }
    if let tab = controller as? UITabBarController {
      return topViewController(from: tab.selectedViewController)
    }
    return controller
  }
}

private func diningDealzShareText(context: DiningDealzPlannerContext, selection: DiningDealzNativeShareSelection) -> String {
  var lines = ["\(context.name) · shared from DiningDealz"]
  if selection.mode == "my-time" {
    let range = [selection.startTime, selection.endTime].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " - ")
    lines.append([selection.date, range].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
  } else {
    if selection.includeHappyHours {
      let hours = context.schedules.filter { $0.kind == "happy-hour" }.map { "\($0.label) (\($0.allDay ? "All day" : "\($0.startTime) - \($0.endTime)"))" }.joined(separator: "; ")
      if !hours.isEmpty { lines.append("Happy hours: \(hours)") }
    }
    if selection.includeOperatingHours {
      let hours = context.schedules.filter { $0.kind == "operating-hours" }.map { "\($0.weekdayLabel ?? "") \($0.allDay ? "Open 24 hours" : "\($0.startTime) - \($0.endTime)")" }.joined(separator: "; ")
      if !hours.isEmpty { lines.append("Hours: \(hours)") }
    }
    if selection.includeDealsAndMenu {
      let deals = context.deals.filter { selection.selectedDealIds.contains($0.id) }.map { [$0.title, $0.priceText, $0.description].filter { !$0.isEmpty }.joined(separator: " — ") }.joined(separator: "; ")
      if !deals.isEmpty { lines.append("Deals: \(deals)") }
    }
  }
  if selection.includeLocation && !context.address.isEmpty { lines.append("Location: \(context.address)") }
  if selection.includeLocation, let mapURL = diningDealzPlannerMapURL(context) { lines.append(mapURL) }
  return lines.filter { !$0.isEmpty }.joined(separator: "\n")
}

private func diningDealzPlannerMapURL(_ context: DiningDealzPlannerContext) -> String? {
  if let latitude = context.latitude, let longitude = context.longitude {
    return "https://www.google.com/maps/search/?api=1&query=\(latitude),\(longitude)"
  }
  guard !context.address.isEmpty else { return nil }
  let query = "\(context.name), \(context.address)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
  return "https://www.google.com/maps/search/?api=1&query=\(query)"
}

private func diningDealzICSData(for draft: DiningDealzNativeCalendarDraft) throws -> Data {
  let formatter = ISO8601DateFormatter()
  let dateFormatter = DateFormatter()
  dateFormatter.dateFormat = "yyyyMMdd"
  func escape(_ value: String) -> String {
    value.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: ",", with: "\\,")
      .replacingOccurrences(of: ";", with: "\\;")
  }
  func icsDate(_ date: Date) -> String {
    formatter.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
    return formatter.string(from: date).replacingOccurrences(of: "-", with: "").replacingOccurrences(of: ":", with: "").replacingOccurrences(of: ".000Z", with: "Z")
  }
  let start = draft.allDay ? dateFormatter.string(from: draft.startAt) : icsDate(draft.startAt)
  let end = draft.allDay ? dateFormatter.string(from: draft.endAt) : icsDate(draft.endAt)
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DiningDealz//External Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:diningdealz-\(UUID().uuidString)@diningdealz",
    "DTSTAMP:\(icsDate(Date()))",
    "DTSTART\(draft.allDay ? ";VALUE=DATE" : ""):\(start)",
    "DTEND\(draft.allDay ? ";VALUE=DATE" : ""):\(end)",
    "SUMMARY:\(escape(draft.title))",
  ]
  if let location = draft.location { lines.append("LOCATION:\(escape(location))") }
  if !draft.notes.isEmpty { lines.append("DESCRIPTION:\(escape(draft.notes))") }
  if draft.weeklyRepeat { lines.append("RRULE:FREQ=WEEKLY") }
  lines.append(contentsOf: ["END:VEVENT", "END:VCALENDAR", ""])
  return lines.joined(separator: "\r\n").data(using: .utf8) ?? Data()
}
