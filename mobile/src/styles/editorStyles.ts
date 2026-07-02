// Structured editor and social preview helper styles.
export const editorStyles = {
  socialPreviewList: {
    gap: 8,
    marginTop: 2,
  },
  socialPreviewCard: {
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
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
    color: '#3b2a1f',
    fontSize: 13,
    fontWeight: '700',
  },
  socialPreviewAction: {
    color: '#9e5b49',
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
    backgroundColor: '#9e5b49',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  structuredEntryAddButtonText: {
    color: '#effffd',
    fontSize: 12,
    fontWeight: '700',
  },
  structuredEntryErrorText: {
    color: '#8d2500',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -2,
  },
  structuredEntryList: {
    gap: 8,
  },
  structuredEntryCard: {
    alignItems: 'center',
    backgroundColor: '#fff7ef',
    borderColor: '#ddc4a7',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  structuredEntryText: {
    color: '#3b2a1f',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  structuredEntryRemoveButton: {
    backgroundColor: '#fde7dd',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  structuredEntryRemoveButtonText: {
    color: '#8d2500',
    fontSize: 12,
    fontWeight: '700',
  },
} as const;

