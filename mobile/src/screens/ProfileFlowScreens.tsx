import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { styles } from '../appStyles';
import type { AuthPortal, LoginFormState, ProfileFormState } from '../appFlowTypes';
import { manualBusinessCityOptions, manualBusinessVenueOptions } from '../browseConfig';
import { formatPlaceAddress, getPlaceLocations, normalizeSearchText } from '../placeHelpers';
import type { PlaceListItem, PlaceLocation } from '../types';

type CompactDropdownProps = {
  onSelect: (value: string) => void;
  open: boolean;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  selectedValue: string;
  onToggle: () => void;
};

export type AuthPortalScreenProps = {
  authMessage: string | null;
  errorMessage: string | null;
  loginForm: LoginFormState;
  loginPortal: AuthPortal;
  onChangeField: (field: keyof LoginFormState, value: string) => void;
  onContinueToApp: () => void;
  onOpenProfiles: () => void;
  onSelectPortal: (portal: AuthPortal) => void;
  onSubmit: () => void;
  submitting: boolean;
};

export type CreateProfileScreenProps = {
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  message: string | null;
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
  onOpenBusinessClaim: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

export type BusinessSearchScreenProps = {
  errorMessage: string | null;
  isLandscape: boolean;
  loadingPlaces: boolean;
  onBack: () => void;
  onChangeSearchQuery: (value: string) => void;
  onChooseManualBusiness: () => void;
  onSelectBusiness: (place: PlaceListItem, locationId: number) => void;
  results: PlaceListItem[];
  searchQuery: string;
};

export type BusinessVerificationScreenProps = {
  errorMessage: string | null;
  form: ProfileFormState;
  isLandscape: boolean;
  mode: 'claimed' | 'manual';
  onBack: () => void;
  onChangeField: (field: keyof ProfileFormState, value: string) => void;
  onToggleAddressNotApplicable: (value: boolean) => void;
  onSubmit: () => void;
  selectedLocation: PlaceLocation | null;
  selectedPlace: PlaceListItem | null;
  submitting: boolean;
};

function KeyboardAwareFormScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingFill}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

function CompactDropdown({ onSelect, open, options, placeholder, selectedValue, onToggle }: CompactDropdownProps) {
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? placeholder;

  function animateDropdownLayout() {
    LayoutAnimation.configureNext({
      duration: 180,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }

  function handleToggle() {
    animateDropdownLayout();
    onToggle();
  }

  function handleSelect(value: string) {
    animateDropdownLayout();
    onSelect(value);
  }

  return (
    <View style={styles.compactDropdownWrap}>
      <Pressable onPress={handleToggle} style={[styles.compactDropdownButton, open ? styles.compactDropdownButtonOpen : null]}>
        <Text style={[styles.compactDropdownText, selectedValue.length === 0 ? styles.compactDropdownPlaceholder : null]}>{selectedLabel}</Text>
        <Text style={styles.compactDropdownCaret}>{open ? '^' : 'v'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.compactDropdownMenu}>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                style={[styles.compactDropdownOption, isSelected ? styles.compactDropdownOptionSelected : null]}
              >
                <Text style={[styles.compactDropdownOptionText, isSelected ? styles.compactDropdownOptionTextSelected : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function AuthPortalScreen({ authMessage, errorMessage, loginForm, loginPortal, onChangeField, onContinueToApp, onOpenProfiles, onSelectPortal, onSubmit, submitting }: AuthPortalScreenProps) {
  return (
    <View style={styles.authScreen}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.authScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.authHero}>
            <View style={styles.authLogoShell}>
              <Text style={styles.authLogoText}>HH</Text>
            </View>
            <Text style={styles.authTitle}>Welcome back</Text>
            <Text style={styles.authSubtitle}>Choose a customer or business portal to continue.</Text>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.modeRow}>
              <Pressable onPress={() => onSelectPortal('customer')} style={[styles.modeButton, loginPortal === 'customer' ? styles.modeButtonActive : null]}>
                <Text style={[styles.modeButtonText, loginPortal === 'customer' ? styles.modeButtonTextActive : null]}>Customer</Text>
              </Pressable>
              <Pressable onPress={() => onSelectPortal('business')} style={[styles.modeButton, loginPortal === 'business' ? styles.modeButtonActive : null]}>
                <Text style={[styles.modeButtonText, loginPortal === 'business' ? styles.modeButtonTextActive : null]}>Business</Text>
              </Pressable>
            </View>

            {authMessage ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{authMessage}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Text style={styles.profileFieldLabel}>Username or email</Text>
            <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('identifier', value)} style={styles.profileInput} value={loginForm.identifier} />

            <Text style={styles.profileFieldLabel}>Password</Text>
            <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={loginForm.password} />

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Logging in...' : loginPortal === 'customer' ? 'Log in as customer' : 'Log in as business'}</Text>
            </Pressable>

            <Pressable onPress={onContinueToApp} style={styles.linkButtonSecondaryWide}>
              <Text style={styles.linkButtonSecondaryText}>Continue to App</Text>
            </Pressable>

            <Pressable onPress={onOpenProfiles} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>Don&apos;t have an account? Create a free account here.</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function CreateProfileScreen({ errorMessage, form, isLandscape, message, onBack, onChangeField, onOpenBusinessClaim, onSubmit, submitting }: CreateProfileScreenProps) {
  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to login</Text>
          </Pressable>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Create Profile</Text>
            <Text style={styles.detailTitle}>Create a customer account</Text>
            <Text style={styles.profileIntroText}>Customer accounts now send an email verification link after signup and open into an in-app dashboard.</Text>

            {message ? (
              <View style={styles.profileSuccessBanner}>
                <Text style={styles.profileSuccessText}>{message}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.profileFormSection}>
              <Text style={styles.profileFieldLabel}>Username</Text>
              <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('username', value)} style={styles.profileInput} value={form.username} />

              <Text style={styles.profileFieldLabel}>Email</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('email', value)} style={styles.profileInput} value={form.email} />

              <Text style={styles.profileFieldLabel}>Password</Text>
              <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={form.password} />

              <Text style={styles.profileFieldLabel}>First name</Text>
              <TextInput onChangeText={(value) => onChangeField('first_name', value)} style={styles.profileInput} value={form.first_name} />

              <Text style={styles.profileFieldLabel}>Last name</Text>
              <TextInput onChangeText={(value) => onChangeField('last_name', value)} style={styles.profileInput} value={form.last_name} />
            </View>

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : 'Create customer profile'}</Text>
            </Pressable>

            <Pressable onPress={onOpenBusinessClaim} style={styles.linkButtonSecondaryWide}>
              <Text style={styles.linkButtonSecondaryText}>Claim a Business</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessSearchScreen({ errorMessage, isLandscape, loadingPlaces, onBack, onChangeSearchQuery, onChooseManualBusiness, onSelectBusiness, results, searchQuery }: BusinessSearchScreenProps) {
  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to create profile</Text>
          </Pressable>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Claim a Business</Text>
            <Text style={styles.detailTitle}>Search your business</Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <TextInput placeholder="Search by business name" placeholderTextColor="#9a7f6c" onChangeText={onChangeSearchQuery} style={styles.profileInput} value={searchQuery} />

            {normalizeSearchText(searchQuery).length === 0 ? (
              <Text style={styles.centerStateText}>Start typing to search for your business.</Text>
            ) : loadingPlaces ? (
              <Text style={styles.centerStateText}>Loading businesses...</Text>
            ) : (
              <View style={styles.claimResultsList}>
                {results.length ? (
                  results.map((place) => (
                    <View key={place.slug} style={styles.claimResultCard}>
                      <Text style={styles.placeTitle}>{place.name}</Text>
                      <Text style={styles.placeMeta}>{place.venue_type_label}</Text>
                      <Text style={styles.claimBusinessHint}>
                        {getPlaceLocations(place).length > 1 ? 'Choose the specific address to verify this claim.' : 'Choose this address to continue to verification.'}
                      </Text>
                      <View style={styles.claimLocationList}>
                        {getPlaceLocations(place).map((location) => (
                          <Pressable
                            key={location.id}
                            onPress={() => onSelectBusiness(place, location.id)}
                            style={styles.claimLocationButton}
                          >
                            <Text style={styles.claimLocationButtonTitle}>{location.city_label}</Text>
                            <Text style={styles.claimLocationButtonText}>{formatPlaceAddress(location)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.centerStateText}>No matching businesses found yet.</Text>
                )}
              </View>
            )}

            <Pressable onPress={onChooseManualBusiness} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>Can&apos;t find your business? Create a business profile for it here.</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}

export function BusinessVerificationScreen({ errorMessage, form, isLandscape, mode, onBack, onChangeField, onToggleAddressNotApplicable, onSubmit, selectedLocation, selectedPlace, submitting }: BusinessVerificationScreenProps) {
  const isManual = mode === 'manual';
  const [openDropdown, setOpenDropdown] = useState<'city' | 'venue' | null>(null);

  function handleSelectDropdownValue(field: 'business_city' | 'business_venue_type', value: string) {
    onChangeField(field, value);
    setOpenDropdown(null);
  }

  return (
    <View style={[styles.profileScreen, isLandscape ? styles.profileScreenLandscape : null]}>
      <KeyboardAwareFormScreen>
        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <View style={styles.profileCard}>
            <Text style={styles.detailCity}>Verification</Text>
            <Text style={styles.detailTitle}>{isManual ? 'Create a business profile' : 'Verify this business claim'}</Text>
            <Text style={styles.profileIntroText}>
              {isManual
                ? 'For upcoming or smaller businesses, some fields stay optional but recommended. Admin will review the submission in Django admin.'
                : 'Claimed businesses require full verification details before they move into admin review.'}
            </Text>

            {!isManual && selectedPlace ? (
              <View style={styles.claimResultCard}>
                <Text style={styles.placeTitle}>{selectedPlace.name}</Text>
                <Text style={styles.placeMeta}>{selectedPlace.venue_type_label}</Text>
                {selectedLocation ? (
                  <>
                    <Text style={styles.claimBusinessHint}>Selected address</Text>
                    <Text style={styles.claimLocationButtonText}>{formatPlaceAddress(selectedLocation)}</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.profileFormSection}>
              {isManual ? (
                <>
                  <Text style={styles.profileFieldLabel}>Business name</Text>
                  <TextInput onChangeText={(value) => onChangeField('business_name', value)} style={styles.profileInput} value={form.business_name} />

                  <Text style={styles.profileFieldLabel}>City</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_city', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'city' ? null : 'city')}
                    open={openDropdown === 'city'}
                    options={[{ label: 'Select a city', value: '' }, ...manualBusinessCityOptions]}
                    placeholder="Select a city"
                    selectedValue={form.business_city}
                  />

                  <Text style={styles.profileFieldLabel}>Business type</Text>
                  <CompactDropdown
                    onSelect={(value) => handleSelectDropdownValue('business_venue_type', value)}
                    onToggle={() => setOpenDropdown((current) => current === 'venue' ? null : 'venue')}
                    open={openDropdown === 'venue'}
                    options={[{ label: 'Select a business type', value: '' }, ...manualBusinessVenueOptions]}
                    placeholder="Select a business type"
                    selectedValue={form.business_venue_type}
                  />

                  <Text style={styles.profileFieldLabel}>Website URL (optional)</Text>
                  <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('business_website_url', value)} style={styles.profileInput} value={form.business_website_url} />
                </>
              ) : null}

              <Text style={styles.profileFieldLabel}>Username</Text>
              <TextInput autoCapitalize="none" onChangeText={(value) => onChangeField('username', value)} style={styles.profileInput} value={form.username} />

              <Text style={styles.profileFieldLabel}>Email</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('email', value)} style={styles.profileInput} value={form.email} />

              <Text style={styles.profileFieldLabel}>Password</Text>
              <TextInput onChangeText={(value) => onChangeField('password', value)} secureTextEntry style={styles.profileInput} value={form.password} />

              <Text style={styles.profileFieldLabel}>First name</Text>
              <TextInput onChangeText={(value) => onChangeField('first_name', value)} style={styles.profileInput} value={form.first_name} />

              <Text style={styles.profileFieldLabel}>Last name</Text>
              <TextInput onChangeText={(value) => onChangeField('last_name', value)} style={styles.profileInput} value={form.last_name} />

              <Text style={styles.profileFieldLabel}>Contact name</Text>
              <TextInput onChangeText={(value) => onChangeField('contact_name', value)} style={styles.profileInput} value={form.contact_name} />

              <Text style={styles.profileFieldLabel}>{isManual ? 'Job title (recommended)' : 'Job title'}</Text>
              <TextInput onChangeText={(value) => onChangeField('job_title', value)} style={styles.profileInput} value={form.job_title} />

              <Text style={styles.profileFieldLabel}>Work email</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => onChangeField('work_email', value)} style={styles.profileInput} value={form.work_email} />

              <Text style={styles.profileFieldLabel}>{isManual ? 'Work phone (recommended)' : 'Work phone'}</Text>
              <TextInput onChangeText={(value) => onChangeField('work_phone', value)} style={styles.profileInput} value={form.work_phone} />

              <Text style={styles.profileFieldLabel}>{isManual ? 'Employer address or “Address Not Applicable”' : 'Employer address'}</Text>
              <TextInput onChangeText={(value) => onChangeField('employer_address', value)} style={styles.profileInput} value={form.employer_address} />

              {isManual ? (
                <Pressable onPress={() => onToggleAddressNotApplicable(!form.address_not_applicable)} style={[styles.toggleChip, form.address_not_applicable ? styles.toggleChipActive : null]}>
                  <Text style={[styles.toggleChipText, form.address_not_applicable ? styles.toggleChipTextActive : null]}>Address Not Applicable</Text>
                </Pressable>
              ) : null}

              <Text style={styles.profileFieldLabel}>Verification summary</Text>
              <TextInput multiline onChangeText={(value) => onChangeField('verification_summary', value)} style={[styles.profileInput, styles.profileTextarea]} value={form.verification_summary} />

              <Text style={styles.profileFieldLabel}>{isManual ? 'Supporting details (recommended)' : 'Supporting details'}</Text>
              <TextInput multiline onChangeText={(value) => onChangeField('supporting_details', value)} style={[styles.profileInput, styles.profileTextarea]} value={form.supporting_details} />
            </View>

            <Pressable onPress={() => void onSubmit()} style={[styles.linkButton, submitting ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonText}>{submitting ? 'Submitting...' : isManual ? 'Create business profile' : 'Submit business claim'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAwareFormScreen>
    </View>
  );
}
