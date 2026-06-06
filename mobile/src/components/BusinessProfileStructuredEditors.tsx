import { Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '../appStyles';
import {
  businessWeekdayOptions,
  createEmptyDealOverride,
  createEmptyHappyHourOverride,
  createEmptyOperatingHourOverride,
  formatHappyHourGroups,
  formatOperatingHourGroups,
} from '../businessProfileOverrides';
import type { BusinessDealHappyHourOverride, BusinessDealOverride, BusinessOperatingHourOverride } from '../types';

const dealTypeOptions = [
  { label: 'Happy Hour', value: 'happy_hour' },
  { label: 'Daily Special', value: 'daily_special' },
  { label: 'Discount', value: 'discount' },
  { label: 'Limited Time', value: 'limited_time' },
  { label: 'Other', value: 'other' },
] as const;

function WeekdaySelector({ selectedWeekday, onSelect }: { onSelect: (weekday: number) => void; selectedWeekday: number }) {
  return (
    <View style={styles.structuredWeekdayRow}>
      {businessWeekdayOptions.map((option) => (
        <Pressable
          key={option.weekday}
          onPress={() => onSelect(option.weekday)}
          style={[styles.structuredWeekdayChip, selectedWeekday === option.weekday ? styles.structuredWeekdayChipActive : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedWeekday === option.weekday ? styles.structuredWeekdayChipTextActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DealTypeSelector({ selectedDealType, onSelect }: { onSelect: (value: string) => void; selectedDealType: string }) {
  return (
    <View style={styles.structuredDealTypeRow}>
      {dealTypeOptions.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={[styles.structuredWeekdayChip, selectedDealType === option.value ? styles.structuredWeekdayChipActive : null]}
        >
          <Text style={[styles.structuredWeekdayChipText, selectedDealType === option.value ? styles.structuredWeekdayChipTextActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type BusinessHoursEditorProps = {
  label: string;
  onChange: (value: BusinessOperatingHourOverride[]) => void;
  supportText: string;
  value: BusinessOperatingHourOverride[];
};

export function BusinessHoursEditor({ label, onChange, supportText, value }: BusinessHoursEditorProps) {
  function updateRow(index: number, nextRow: BusinessOperatingHourOverride) {
    onChange(value.map((row, rowIndex) => rowIndex === index ? nextRow : row));
  }

  return (
    <View style={styles.structuredEditorSection}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <Text style={styles.profileSupportText}>{supportText}</Text>
      {value.map((row, index) => (
        <View key={row.id ?? `${row.weekday}-${index}`} style={styles.structuredEditorCard}>
          <WeekdaySelector selectedWeekday={row.weekday} onSelect={(weekday) => updateRow(index, { ...row, weekday })} />
          <View style={styles.structuredTimeRow}>
            <TextInput
              onChangeText={(open_time) => updateRow(index, { ...row, open_time })}
              placeholder="11:00 AM"
              placeholderTextColor="#9a7f6c"
              style={[styles.profileInput, styles.structuredTimeInput]}
              value={row.open_time}
            />
            <TextInput
              onChangeText={(close_time) => updateRow(index, { ...row, close_time })}
              placeholder="10:00 PM"
              placeholderTextColor="#9a7f6c"
              style={[styles.profileInput, styles.structuredTimeInput]}
              value={row.close_time}
            />
          </View>
          <Pressable onPress={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))} style={styles.structuredRemoveButton}>
            <Text style={styles.structuredRemoveButtonText}>Remove hours row</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...value, createEmptyOperatingHourOverride()])} style={styles.linkButtonSecondary}>
        <Text style={styles.linkButtonSecondaryText}>Add hours row</Text>
      </Pressable>
      {value.length ? (
        <View style={styles.hourList}>
          {formatOperatingHourGroups(value).map((group) => (
            <View key={group.id} style={styles.hourGroupCard}>
              <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
              <Text style={styles.hourRow}>{group.timeLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type BusinessDealsEditorProps = {
  label: string;
  onChange: (value: BusinessDealOverride[]) => void;
  supportText: string;
  value: BusinessDealOverride[];
};

export function BusinessDealsEditor({ label, onChange, supportText, value }: BusinessDealsEditorProps) {
  function updateDeal(index: number, nextDeal: BusinessDealOverride) {
    onChange(value.map((deal, dealIndex) => dealIndex === index ? nextDeal : deal));
  }

  function updateHappyHour(dealIndex: number, happyHourIndex: number, nextWindow: BusinessDealHappyHourOverride) {
    updateDeal(
      dealIndex,
      {
        ...value[dealIndex],
        happy_hours: value[dealIndex].happy_hours.map((window, index) => index === happyHourIndex ? nextWindow : window),
      },
    );
  }

  return (
    <View style={styles.structuredEditorSection}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <Text style={styles.profileSupportText}>{supportText}</Text>
      {value.map((deal, dealIndex) => (
        <View key={deal.id ?? `deal-${dealIndex}`} style={styles.structuredEditorCard}>
          <TextInput onChangeText={(title) => updateDeal(dealIndex, { ...deal, title })} placeholder="Deal title" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.title} />
          <TextInput onChangeText={(price_text) => updateDeal(dealIndex, { ...deal, price_text })} placeholder="Price or savings" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.price_text} />
          <TextInput multiline onChangeText={(description) => updateDeal(dealIndex, { ...deal, description })} placeholder="Deal description" placeholderTextColor="#9a7f6c" style={[styles.profileInput, styles.dashboardMultilineInput]} textAlignVertical="top" value={deal.description} />
          <TextInput onChangeText={(terms) => updateDeal(dealIndex, { ...deal, terms })} placeholder="Terms or restrictions" placeholderTextColor="#9a7f6c" style={styles.profileInput} value={deal.terms} />
          <DealTypeSelector selectedDealType={deal.deal_type} onSelect={(deal_type) => updateDeal(dealIndex, { ...deal, deal_type })} />

          {deal.happy_hours.map((window, happyHourIndex) => (
            <View key={window.id ?? `happy-hour-${happyHourIndex}`} style={styles.structuredNestedCard}>
              <WeekdaySelector selectedWeekday={window.weekday} onSelect={(weekday) => updateHappyHour(dealIndex, happyHourIndex, { ...window, weekday })} />
              <Pressable onPress={() => updateHappyHour(dealIndex, happyHourIndex, { ...window, all_day: !window.all_day })} style={[styles.structuredWeekdayChip, window.all_day ? styles.structuredWeekdayChipActive : null]}>
                <Text style={[styles.structuredWeekdayChipText, window.all_day ? styles.structuredWeekdayChipTextActive : null]}>All day</Text>
              </Pressable>
              {!window.all_day ? (
                <View style={styles.structuredTimeRow}>
                  <TextInput
                    onChangeText={(start_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, start_time })}
                    placeholder="3:00 PM"
                    placeholderTextColor="#9a7f6c"
                    style={[styles.profileInput, styles.structuredTimeInput]}
                    value={window.start_time}
                  />
                  <TextInput
                    onChangeText={(end_time) => updateHappyHour(dealIndex, happyHourIndex, { ...window, end_time })}
                    placeholder="6:00 PM"
                    placeholderTextColor="#9a7f6c"
                    style={[styles.profileInput, styles.structuredTimeInput]}
                    value={window.end_time}
                  />
                </View>
              ) : null}
              <Pressable onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: deal.happy_hours.filter((_, index) => index !== happyHourIndex) })} style={styles.structuredRemoveButton}>
                <Text style={styles.structuredRemoveButtonText}>Remove day/time</Text>
              </Pressable>
            </View>
          ))}

          <Pressable onPress={() => updateDeal(dealIndex, { ...deal, happy_hours: [...deal.happy_hours, createEmptyHappyHourOverride()] })} style={styles.linkButtonSecondary}>
            <Text style={styles.linkButtonSecondaryText}>Add deal day/time</Text>
          </Pressable>

          <View style={styles.dealCard}>
            <View style={styles.dealHeaderRow}>
              <Text style={styles.dealTitle}>{deal.title || 'Untitled deal'}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{dealTypeOptions.find((option) => option.value === deal.deal_type)?.label ?? 'Deal'}</Text>
              </View>
            </View>
            {deal.price_text ? <Text style={styles.dealPrice}>{deal.price_text}</Text> : null}
            {deal.description ? <Text style={styles.dealDescription}>{deal.description}</Text> : null}
            {deal.terms ? <Text style={styles.dealTerms}>Terms: {deal.terms}</Text> : null}
            <View style={styles.hourList}>
              {formatHappyHourGroups(deal.happy_hours, []).map((group) => (
                <View key={group.id} style={styles.hourGroupCard}>
                  <Text style={styles.hourGroupDays}>{group.dayLabel}</Text>
                  <Text style={styles.hourRow}>{group.timeLabel}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable onPress={() => onChange(value.filter((_, index) => index !== dealIndex))} style={styles.structuredRemoveButton}>
            <Text style={styles.structuredRemoveButtonText}>Remove deal</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...value, createEmptyDealOverride()])} style={styles.linkButtonSecondary}>
        <Text style={styles.linkButtonSecondaryText}>Add deal or special</Text>
      </Pressable>
    </View>
  );
}