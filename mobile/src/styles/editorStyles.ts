import { theme } from './theme';

// Structured editor and social preview helper styles.
export const editorStyles = {
  socialPreviewList: {
    gap: 8,
    marginTop: 2,
  },
  socialPreviewCard: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  socialPreviewCardDisabled: {
    opacity: 0.7,
  },
  socialPreviewLink: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  socialPreviewAction: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  structuredEntrySection: {
    gap: 8,
  },
  structuredEntryInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  structuredEntryInput: {
    flex: 1,
  },
  structuredEntryAddButton: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  structuredEntryAddButtonText: {
    color: theme.textOnAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  structuredEntryErrorText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -2,
  },
  structuredEntryList: {
    gap: 8,
  },
  structuredEntryCard: {
    alignItems: 'center',
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  structuredEntryText: {
    color: theme.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  structuredEntryRemoveButton: {
    backgroundColor: theme.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  structuredEntryRemoveButtonText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
  },
} as const;

