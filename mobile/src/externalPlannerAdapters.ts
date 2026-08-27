import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { NativeModules, Platform, UIManager } from 'react-native';
import type * as CalendarModule from 'expo-calendar';
import type { ViewShotRef } from 'react-native-view-shot';

import {
  buildIcsContent,
  buildShareText,
  type CalendarEventDraft,
  type PlannerPlaceContext,
  type RestaurantShareSelection,
} from './externalPlanner';

type NativePlannerModule = {
  presentCalendarComposer?: (payload: string) => Promise<unknown>;
  presentShareComposer?: (payload: string) => Promise<unknown>;
};

const nativePlannerModuleName = 'DiningDealzExternalPlanner';
const minimumNativeIOSVersion = 15.1;

function getCalendarModule() {
  return require('expo-calendar') as typeof CalendarModule;
}

function getShareModule() {
  return require('react-native-share').default as typeof import('react-native-share').default;
}

function getCaptureRef() {
  return require('react-native-view-shot').captureRef as typeof import('react-native-view-shot').captureRef;
}

function nativePlannerModule() {
  return NativeModules[nativePlannerModuleName] as NativePlannerModule | undefined;
}

function iosVersion() {
  if (Platform.OS !== 'ios') {
    return 0;
  }
  const version = typeof Platform.Version === 'string'
    ? Number.parseFloat(Platform.Version)
    : Number(Platform.Version);
  return Number.isFinite(version) ? version : 0;
}

export function isNativeIOSExternalPlannerAvailable() {
  if (iosVersion() < minimumNativeIOSVersion) {
    return false;
  }

  const module = nativePlannerModule();
  if (module?.presentCalendarComposer && module.presentShareComposer) {
    return true;
  }

  const nativeUIManager = UIManager as typeof UIManager & {
    getViewManagerConfig?: (name: string) => unknown;
  };
  return Boolean(nativeUIManager.getViewManagerConfig?.(nativePlannerModuleName));
}

function encodeNativePayload(context: PlannerPlaceContext) {
  return JSON.stringify(context);
}

export async function presentNativeIOSCalendarComposer(context: PlannerPlaceContext) {
  const module = nativePlannerModule();
  if (!module?.presentCalendarComposer) {
    throw new Error('The native iOS calendar composer is unavailable.');
  }
  return module.presentCalendarComposer(encodeNativePayload(context));
}

export async function presentNativeIOSShareComposer(context: PlannerPlaceContext) {
  const module = nativePlannerModule();
  if (!module?.presentShareComposer) {
    throw new Error('The native iOS share composer is unavailable.');
  }
  return module.presentShareComposer(encodeNativePayload(context));
}

async function shareIcsFallback(draft: CalendarEventDraft) {
  const cacheDirectory = FileSystem.cacheDirectory ?? '';
  const fileUri = `${cacheDirectory}diningdealz-${Date.now()}.ics`;
  await FileSystem.writeAsStringAsync(fileUri, buildIcsContent(draft), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Calendar creation is unavailable and this device cannot share an .ics file.');
  }

  await Sharing.shareAsync(fileUri, {
    UTI: 'public.calendar-event',
    dialogTitle: 'Add DiningDealz visit to a calendar',
    mimeType: 'text/calendar',
  });
}

export async function openExternalCalendarEvent(draft: CalendarEventDraft) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    await shareIcsFallback(draft);
    return { usedIcsFallback: true };
  }

  try {
    const calendar = getCalendarModule();
    if (!(await calendar.isAvailableAsync())) {
      throw new Error('Calendar API unavailable');
    }

    await calendar.createEventInCalendarAsync({
      allDay: draft.allDay === true,
      endDate: new Date(draft.endAt),
      location: draft.location ?? '',
      notes: draft.notes,
      recurrenceRule: draft.weeklyRepeat
        ? { frequency: calendar.Frequency.WEEKLY, interval: 1 }
        : null,
      startDate: new Date(draft.startAt),
      timeZone: draft.timeZone,
      title: draft.title,
    });
    return { usedIcsFallback: false };
  } catch (error) {
    try {
      await shareIcsFallback(draft);
      return { usedIcsFallback: true };
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : '';
      throw new Error(message || (error instanceof Error ? error.message : 'Unable to open a calendar editor.'));
    }
  }
}

export async function openExternalShare(
  context: PlannerPlaceContext,
  selection: RestaurantShareSelection,
  cardRef: RefObject<ViewShotRef | null>,
) {
  const message = buildShareText(context, selection);
  let cardUri: string | null = null;

  try {
    cardUri = await getCaptureRef()(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
  } catch {
    // Text and the map link still provide a useful share if an image capture fails.
  }

  await getShareModule().open({
    failOnCancel: false,
    message,
    title: `Share ${context.name}`,
    type: cardUri ? 'image/png' : undefined,
    urls: cardUri ? [cardUri] : undefined,
  });
}
