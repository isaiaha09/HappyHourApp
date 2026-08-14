import CoreLocation
import Foundation
import React

@objc(DiningDealzLocation)
final class DiningDealzLocation: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let geocoder = CLGeocoder()
  private var currentLocationResolver: RCTPromiseResolveBlock?
  private var currentLocationRejecter: RCTPromiseRejectBlock?
  private var authorizationResolver: RCTPromiseResolveBlock?
  private var authorizationRejecter: RCTPromiseRejectBlock?
  private var requestingAlwaysAuthorization = false

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = kCLDistanceFilterNone
    locationManager.pausesLocationUpdatesAutomatically = false
    locationManager.allowsBackgroundLocationUpdates = true
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["locationUpdate", "authorizationChange"]
  }

  @objc(getAuthorizationStatus:rejecter:)
  func getAuthorizationStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(authorizationPayload())
  }

  @objc(requestForegroundAuthorization:rejecter:)
  func requestForegroundAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    requestAuthorization(always: false, resolve: resolve, reject: reject)
  }

  @objc(requestBackgroundAuthorization:rejecter:)
  func requestBackgroundAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    requestAuthorization(always: true, resolve: resolve, reject: reject)
  }

  @objc(hasServicesEnabled:rejecter:)
  func hasServicesEnabled(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(CLLocationManager.locationServicesEnabled())
  }

  @objc(getCurrentPosition:rejecter:)
  func getCurrentPosition(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard canUseLocation() else {
      reject("LOCATION_UNAVAILABLE", "Location permission is not available.", nil)
      return
    }

    currentLocationResolver = resolve
    currentLocationRejecter = reject
    locationManager.requestLocation()
  }

  @objc(startUpdatingLocation:rejecter:)
  func startUpdatingLocation(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard canUseLocation() else {
      reject("LOCATION_UNAVAILABLE", "Location permission is not available.", nil)
      return
    }

    locationManager.allowsBackgroundLocationUpdates = true
    locationManager.startUpdatingLocation()
    resolve(nil)
  }

  @objc(stopUpdatingLocation:rejecter:)
  func stopUpdatingLocation(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    locationManager.stopUpdatingLocation()
    resolve(nil)
  }

  @objc(reverseGeocode:longitude:resolver:rejecter:)
  func reverseGeocode(
    _ latitude: NSNumber,
    longitude: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let location = CLLocation(latitude: latitude.doubleValue, longitude: longitude.doubleValue)
    geocoder.reverseGeocodeLocation(location) { placemarks, error in
      if let error {
        reject("GEOCODING_ERROR", error.localizedDescription, error)
        return
      }

      guard let placemark = placemarks?.first else {
        resolve(nil)
        return
      }

      let street = [placemark.subThoroughfare, placemark.thoroughfare]
        .compactMap { value in
          let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          return normalized.isEmpty ? nil : normalized
        }
        .joined(separator: " ")
      let city = (
        placemark.locality
        ?? placemark.subAdministrativeArea
        ?? placemark.administrativeArea
        ?? ""
      ).trimmingCharacters(in: .whitespacesAndNewlines)

      resolve([
        "street": street,
        "city": city,
      ])
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    sendEvent(withName: "authorizationChange", body: authorizationPayload())

    if requestingAlwaysAuthorization && status == .authorizedWhenInUse {
      requestingAlwaysAuthorization = false
      manager.requestAlwaysAuthorization()
      return
    }

    guard let resolver = authorizationResolver else {
      return
    }

    let rejecter = authorizationRejecter
    authorizationResolver = nil
    authorizationRejecter = nil

    if status == .denied || status == .restricted {
      rejecter?("LOCATION_PERMISSION_DENIED", "Location permission was denied.", nil)
    } else {
      resolver(authorizationPayload())
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.max(by: { $0.timestamp < $1.timestamp }) else {
      return
    }

    let payload = locationPayload(location)
    sendEvent(withName: "locationUpdate", body: payload)

    guard let resolver = currentLocationResolver else {
      return
    }

    currentLocationResolver = nil
    currentLocationRejecter = nil
    resolver(payload)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    currentLocationResolver = nil
    currentLocationRejecter?(
      "LOCATION_ERROR",
      error.localizedDescription,
      error
    )
    currentLocationRejecter = nil
  }

  private func requestAuthorization(
    always: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let status = locationManager.authorizationStatus
    if status == .authorizedAlways || (!always && status == .authorizedWhenInUse) {
      resolve(authorizationPayload())
      return
    }

    if status == .denied || status == .restricted {
      reject("LOCATION_PERMISSION_DENIED", "Location permission was denied.", nil)
      return
    }

    authorizationResolver = resolve
    authorizationRejecter = reject
    requestingAlwaysAuthorization = always && status == .notDetermined

    if always && status == .notDetermined {
      locationManager.requestWhenInUseAuthorization()
    } else if always {
      locationManager.requestAlwaysAuthorization()
    } else {
      locationManager.requestWhenInUseAuthorization()
    }
  }

  private func canUseLocation() -> Bool {
    let status = locationManager.authorizationStatus
    return CLLocationManager.locationServicesEnabled()
      && (status == .authorizedAlways || status == .authorizedWhenInUse)
  }

  private func authorizationPayload() -> [String: Any] {
    let status = locationManager.authorizationStatus
    let statusValue: String
    switch status {
    case .notDetermined:
      statusValue = "notDetermined"
    case .restricted:
      statusValue = "restricted"
    case .denied:
      statusValue = "denied"
    case .authorizedAlways:
      statusValue = "authorizedAlways"
    case .authorizedWhenInUse:
      statusValue = "authorizedWhenInUse"
    @unknown default:
      statusValue = "unknown"
    }

    return [
      "status": statusValue,
      "granted": status == .authorizedAlways || status == .authorizedWhenInUse,
      "canAskAgain": status != .denied && status != .restricted,
    ]
  }

  private func locationPayload(_ location: CLLocation) -> [String: Any] {
    let accuracy: Any
    if location.horizontalAccuracy >= 0 {
      accuracy = location.horizontalAccuracy
    } else {
      accuracy = NSNull()
    }

    return [
      "coords": [
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "accuracy": accuracy,
      ],
      "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
    ]
  }
}
