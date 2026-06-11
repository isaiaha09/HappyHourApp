(function () {
  const weekdayOptions = [
    { label: 'Mon', value: 0 },
    { label: 'Tue', value: 1 },
    { label: 'Wed', value: 2 },
    { label: 'Thu', value: 3 },
    { label: 'Fri', value: 4 },
    { label: 'Sat', value: 5 },
    { label: 'Sun', value: 6 },
  ];

  const dealTypeOptions = [
    { label: 'Happy Hour', value: 'happy_hour' },
    { label: 'Daily Special', value: 'daily_special' },
    { label: 'Discount', value: 'discount' },
    { label: 'Limited Time', value: 'limited_time' },
    { label: 'Other', value: 'other' },
  ];

  function createId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function createEmptyHappyHour() {
    return {
      id: createId('happy-hour'),
      weekdays: [0],
      weekday: 0,
      start_time: '3:00 PM',
      end_time: '6:00 PM',
      all_day: false,
    };
  }

  function createEmptyDeal() {
    return {
      id: createId('deal'),
      title: '',
      description: '',
      deal_type: 'happy_hour',
      custom_deal_type_label: '',
      price_text: '',
      terms: '',
      happy_hours: [createEmptyHappyHour()],
    };
  }

  function createEmptyHoursRow() {
    return {
      id: createId('hours'),
      group_id: createId('hours-group'),
      weekdays: [0],
      weekday: 0,
      open_time: '11:00 AM',
      close_time: '10:00 PM',
    };
  }

  function formatTime(value) {
    const normalized = String(value || '').trim();
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      const hour = Number.parseInt(match24[1], 10);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return hour12 + ':' + match24[2] + ' ' + suffix;
    }
    const match12 = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match12) {
      return Number.parseInt(match12[1], 10) + ':' + (match12[2] || '00') + ' ' + match12[3].toUpperCase();
    }
    return normalized;
  }

  function normalizeTimeInput(value) {
    const normalized = String(value || '').trim();
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      const hour = Number.parseInt(match24[1], 10);
      const minute = Number.parseInt(match24[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      }
      return normalized;
    }

    const match12 = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!match12) {
      return normalized;
    }

    let hour = Number.parseInt(match12[1], 10);
    const minute = Number.parseInt(match12[2] || '00', 10);
    const meridiem = match12[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return normalized;
    }
    if (meridiem === 'AM') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }

  function formatWeekdayRange(values) {
    const unique = Array.from(new Set(values)).sort(function (left, right) { return left - right; });
    if (!unique.length) {
      return '';
    }
    const segments = [];
    let start = unique[0];
    let previous = unique[0];
    for (let index = 1; index < unique.length; index += 1) {
      const current = unique[index];
      if (current === previous + 1) {
        previous = current;
        continue;
      }
      segments.push(formatWeekdaySegment(start, previous));
      start = current;
      previous = current;
    }
    segments.push(formatWeekdaySegment(start, previous));
    return segments.join(', ');
  }

  function formatWeekdaySegment(start, end) {
    if (start === end) {
      return weekdayOptions[start].label.toUpperCase();
    }
    return weekdayOptions[start].label.toUpperCase() + '-' + weekdayOptions[end].label.toUpperCase();
  }

  function formatHappyHourGroups(happyHours) {
    const grouped = new Map();
    happyHours.forEach(function (window) {
      const key = window.all_day ? 'all-day' : String(window.start_time) + '-' + String(window.end_time);
      const items = grouped.get(key) || [];
      items.push(window);
      grouped.set(key, items);
    });
    return Array.from(grouped.values()).map(function (group, index) {
      return {
        id: 'group-' + index,
        dayLabel: formatWeekdayRange(group.flatMap(function (window) { return getWindowWeekdays(window); })),
        timeLabel: group[0].all_day ? 'All day' : formatTime(group[0].start_time) + ' - ' + formatTime(group[0].end_time),
      };
    });
  }

  function getWindowWeekdays(window) {
    const rawWeekdays = Array.isArray(window.weekdays) && window.weekdays.length ? window.weekdays : [window.weekday];
    return Array.from(new Set(rawWeekdays.map(function (weekday) { return Number(weekday); }).filter(function (weekday) {
      return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;
    }))).sort(function (left, right) { return left - right; });
  }

  function groupHappyHoursForState(happyHours) {
    const groups = new Map();
    (happyHours || []).forEach(function (window) {
      const key = (window.all_day ? 'all-day' : 'timed') + '|' + String(window.start_time || '') + '|' + String(window.end_time || '');
      const current = groups.get(key);
      if (current) {
        current.weekdays = Array.from(new Set(current.weekdays.concat([window.weekday]))).sort(function (left, right) { return left - right; });
        current.weekday = current.weekdays[0] || 0;
        return;
      }
      const weekdays = getWindowWeekdays(window);
      groups.set(key, {
        id: createId('happy-hour'),
        weekday: weekdays[0] || Number(window.weekday || 0),
        weekdays: weekdays.length ? weekdays : [Number(window.weekday || 0)],
        start_time: String(window.start_time || ''),
        end_time: String(window.end_time || ''),
        all_day: Boolean(window.all_day),
      });
    });
    return Array.from(groups.values());
  }

  function normalizeDealsForState(deals) {
    return (deals || []).map(function (deal) {
      return Object.assign({}, deal, {
        custom_deal_type_label: deal.custom_deal_type_label || '',
        happy_hours: groupHappyHoursForState(deal.happy_hours || []),
      });
    });
  }

  function serializeDealsForTextarea(deals) {
    return deals.map(function (deal) {
      const serializedHappyHours = (deal.happy_hours || []).flatMap(function (window) {
        return getWindowWeekdays(window).map(function (weekday) {
          return {
            weekday: weekday,
            start_time: window.start_time,
            end_time: window.end_time,
            all_day: Boolean(window.all_day),
          };
        });
      });
      return {
        title: deal.title,
        description: deal.description,
        deal_type: deal.deal_type,
        custom_deal_type_label: deal.custom_deal_type_label || '',
        price_text: deal.price_text,
        terms: deal.terms,
        happy_hours: serializedHappyHours,
      };
    });
  }

  function formatOperatingHourGroups(rows) {
    return (rows || []).map(function (row, index) {
      return {
        id: row.group_id || 'hours-' + index,
        dayLabel: formatWeekdayRange(getOperatingHourWeekdays(row)),
        timeLabel: formatTime(row.open_time) + ' - ' + formatTime(row.close_time),
      };
    });
  }

  function getOperatingHourWeekdays(row) {
    const rawWeekdays = Array.isArray(row.weekdays) && row.weekdays.length ? row.weekdays : [row.weekday];
    return Array.from(new Set(rawWeekdays.map(function (weekday) { return Number(weekday); }).filter(function (weekday) {
      return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;
    }))).sort(function (left, right) { return left - right; });
  }

  function groupOperatingHoursForState(rows) {
    const groups = new Map();
    (rows || []).forEach(function (row, index) {
      const key = row.group_id ? 'group:' + String(row.group_id) : String(row.open_time || '') + '|' + String(row.close_time || '');
      const current = groups.get(key);
      if (current) {
        current.weekdays = Array.from(new Set(current.weekdays.concat([row.weekday]))).sort(function (left, right) { return left - right; });
        current.weekday = current.weekdays[0] || 0;
        return;
      }
      const weekdays = getOperatingHourWeekdays(row);
      groups.set(key, {
        id: createId('hours'),
        group_id: row.group_id || 'derived-hours-group-' + index,
        group_rank: row.group_rank !== undefined && row.group_rank !== null ? Number(row.group_rank) : index,
        weekday: weekdays[0] || Number(row.weekday || 0),
        weekdays: weekdays.length ? weekdays : [Number(row.weekday || 0)],
        open_time: String(row.open_time || ''),
        close_time: String(row.close_time || ''),
      });
    });
    return Array.from(groups.values()).sort(function (left, right) {
      return Number(left.group_rank || 0) - Number(right.group_rank || 0);
    });
  }

  function serializeHoursForTextarea(rows) {
    return (rows || []).flatMap(function (row, index) {
      return getOperatingHourWeekdays(row).map(function (weekday) {
        return {
          weekday: weekday,
          open_time: row.open_time,
          close_time: row.close_time,
          group_id: row.group_id || row.id || 'hours-group-' + index,
          group_rank: row.group_rank !== undefined && row.group_rank !== null ? Number(row.group_rank) : index,
        };
      });
    });
  }

  function safeJsonParse(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return null;
    }
  }

  function hydrateStructuredEditor(textarea) {
    const type = textarea.dataset.structuredEditor;
    if (!type) {
      return;
    }

    const parsedTextareaValue = safeJsonParse(textarea.value);
    const parsedInitialValue = safeJsonParse(textarea.dataset.initialJson || '[]');
    const initialValue = parsedTextareaValue !== null ? parsedTextareaValue : parsedInitialValue;
    const seededFromCurrentPublic = textarea.dataset.initialSource === 'current-public' && parsedTextareaValue === null;
    if (parsedTextareaValue === null && parsedInitialValue === null && String(textarea.value || '').trim()) {
      return;
    }

    const state = {
      value: Array.isArray(initialValue) ? initialValue : [],
    };
    if (type === 'deals') {
      state.value = normalizeDealsForState(state.value);
    } else {
      state.value = groupOperatingHoursForState(state.value);
    }

    textarea.classList.add('is-structured-enhanced');
    const editorRoot = document.createElement('div');
    editorRoot.className = 'structured-admin-editor';
    textarea.insertAdjacentElement('afterend', editorRoot);

    function syncTextarea() {
      textarea.value = JSON.stringify(type === 'deals' ? serializeDealsForTextarea(state.value) : serializeHoursForTextarea(state.value));
    }

    function buildInput(labelText, value, onInput, options) {
      const label = document.createElement('label');
      label.className = 'structured-admin-editor__label';
      label.append(document.createTextNode(labelText));
      const element = (options && options.multiline) ? document.createElement('textarea') : document.createElement('input');
      element.className = options && options.multiline ? 'structured-admin-editor__textarea' : 'structured-admin-editor__input';
      const uses12HourTime = Boolean(options && options.timeFormat === '12hr');
      element.value = uses12HourTime ? formatTime(value || '') : (value || '');
      if (options && options.placeholder) {
        element.placeholder = options.placeholder;
      }
      element.addEventListener('input', function () {
        onInput(uses12HourTime ? normalizeTimeInput(element.value) : element.value);
      });
      if (uses12HourTime) {
        element.addEventListener('blur', function () {
          const normalizedValue = normalizeTimeInput(element.value);
          onInput(normalizedValue);
          element.value = formatTime(normalizedValue);
        });
      }
      label.append(element);
      return label;
    }

    function buildSelect(labelText, value, optionList, onChange) {
      const label = document.createElement('label');
      label.className = 'structured-admin-editor__label';
      label.append(document.createTextNode(labelText));
      const select = document.createElement('select');
      select.className = 'structured-admin-editor__select';
      optionList.forEach(function (option) {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === value) {
          optionElement.selected = true;
        }
        select.append(optionElement);
      });
      select.addEventListener('change', function () { onChange(select.value); });
      label.append(select);
      return label;
    }

    function buildWeekdayButtons(selectedWeekday, onSelect, selectedWeekdays) {
      const activeWeekdays = Array.isArray(selectedWeekdays) && selectedWeekdays.length
        ? selectedWeekdays
        : [selectedWeekday];
      const row = document.createElement('div');
      row.className = 'structured-admin-editor__weekday-row';
      weekdayOptions.forEach(function (option) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'structured-admin-editor__weekday-button' + (activeWeekdays.includes(option.value) ? ' is-active' : '');
        button.textContent = option.label;
        button.addEventListener('click', function () { onSelect(option.value); });
        row.append(button);
      });
      return row;
    }

    function buildButton(labelText, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = labelText;
      button.addEventListener('click', onClick);
      return button;
    }

    function renderDeals() {
      editorRoot.innerHTML = '';
      if (!state.value.length) {
        const empty = document.createElement('div');
        empty.className = 'structured-admin-editor__empty';
        empty.textContent = 'No manual deal overrides yet.';
        editorRoot.append(empty);
      }

      state.value.forEach(function (deal, dealIndex) {
        const card = document.createElement('div');
        card.className = 'structured-admin-editor__card';

        const row = document.createElement('div');
        row.className = 'structured-admin-editor__row structured-admin-editor__row--split';
        row.append(buildInput('Title', deal.title, function (nextValue) {
          state.value[dealIndex].title = nextValue;
          syncTextarea();
        }, { placeholder: 'Deal title' }));
        row.append(buildSelect('Type', deal.deal_type || 'happy_hour', dealTypeOptions, function (nextValue) {
          state.value[dealIndex].deal_type = nextValue;
          if (nextValue !== 'other') {
            state.value[dealIndex].custom_deal_type_label = '';
          }
          syncTextarea();
          renderDeals();
        }));
        card.append(row);

        if ((deal.deal_type || 'happy_hour') === 'other') {
          card.append(buildInput('Custom type', deal.custom_deal_type_label, function (nextValue) {
            state.value[dealIndex].custom_deal_type_label = nextValue;
            syncTextarea();
          }, { placeholder: 'Special Event, Combo Deal, Taco Tuesday...' }));
        }

        const rowTwo = document.createElement('div');
        rowTwo.className = 'structured-admin-editor__row structured-admin-editor__row--split';
        rowTwo.append(buildInput('Price or savings', deal.price_text, function (nextValue) {
          state.value[dealIndex].price_text = nextValue;
          syncTextarea();
        }, { placeholder: '$9.99 or 20% off' }));
        rowTwo.append(buildInput('Terms', deal.terms, function (nextValue) {
          state.value[dealIndex].terms = nextValue;
          syncTextarea();
        }, { placeholder: 'Dine-in only' }));
        card.append(rowTwo);

        card.append(buildInput('Description', deal.description, function (nextValue) {
          state.value[dealIndex].description = nextValue;
          syncTextarea();
        }, { multiline: true, placeholder: 'Describe the deal or special' }));

        const happyHourHeading = document.createElement('h4');
        happyHourHeading.className = 'structured-admin-editor__heading';
        happyHourHeading.textContent = 'Happy hour windows';
        card.append(happyHourHeading);

        deal.happy_hours = Array.isArray(deal.happy_hours) ? deal.happy_hours : [];
        deal.happy_hours.forEach(function (window, windowIndex) {
          const nestedCard = document.createElement('div');
          nestedCard.className = 'structured-admin-editor__nested-card';
          nestedCard.append(buildWeekdayButtons(window.weekday, function (nextWeekday) {
            const existingWeekdays = getWindowWeekdays(state.value[dealIndex].happy_hours[windowIndex]);
            const nextWeekdays = existingWeekdays.includes(nextWeekday)
              ? existingWeekdays.filter(function (weekday) { return weekday !== nextWeekday; })
              : existingWeekdays.concat([nextWeekday]).sort(function (left, right) { return left - right; });
            state.value[dealIndex].happy_hours[windowIndex].weekdays = nextWeekdays.length ? nextWeekdays : [nextWeekday];
            state.value[dealIndex].happy_hours[windowIndex].weekday = state.value[dealIndex].happy_hours[windowIndex].weekdays[0] || nextWeekday;
            syncTextarea();
            renderDeals();
          }, getWindowWeekdays(window)));

          const toggleRow = document.createElement('div');
          toggleRow.className = 'structured-admin-editor__inline-toggle-row';
          toggleRow.append(buildButton('All day', 'structured-admin-editor__toggle' + (window.all_day ? ' is-active' : ''), function () {
            state.value[dealIndex].happy_hours[windowIndex].all_day = !state.value[dealIndex].happy_hours[windowIndex].all_day;
            syncTextarea();
            renderDeals();
          }));
          nestedCard.append(toggleRow);

          if (!window.all_day) {
            const timeRow = document.createElement('div');
            timeRow.className = 'structured-admin-editor__row structured-admin-editor__row--split';
            timeRow.append(buildInput('Start time', window.start_time, function (nextValue) {
              state.value[dealIndex].happy_hours[windowIndex].start_time = nextValue;
              syncTextarea();
            }, { placeholder: '3:00 PM', timeFormat: '12hr' }));
            timeRow.append(buildInput('End time', window.end_time, function (nextValue) {
              state.value[dealIndex].happy_hours[windowIndex].end_time = nextValue;
              syncTextarea();
            }, { placeholder: '6:00 PM', timeFormat: '12hr' }));
            nestedCard.append(timeRow);
          }

          nestedCard.append(buildButton('Remove day/time', 'structured-admin-editor__button--danger', function () {
            state.value[dealIndex].happy_hours.splice(windowIndex, 1);
            syncTextarea();
            renderDeals();
          }));
          card.append(nestedCard);
        });

        const happyHourButtonRow = document.createElement('div');
        happyHourButtonRow.className = 'structured-admin-editor__button-row';
        happyHourButtonRow.append(buildButton('Add deal day/time', 'structured-admin-editor__button', function () {
          state.value[dealIndex].happy_hours.push(createEmptyHappyHour());
          syncTextarea();
          renderDeals();
        }));
        card.append(happyHourButtonRow);

        const preview = document.createElement('div');
        preview.className = 'structured-admin-editor__preview';
        const previewCard = document.createElement('div');
        previewCard.className = 'structured-admin-editor__preview-card';
        const previewHeader = document.createElement('div');
        previewHeader.className = 'structured-admin-editor__preview-header';
        const title = document.createElement('strong');
        title.className = 'structured-admin-editor__preview-title';
        title.textContent = deal.title || 'Untitled deal';
        previewHeader.append(title);
        const pill = document.createElement('span');
        pill.className = 'structured-admin-editor__pill';
        pill.textContent = deal.custom_deal_type_label || (dealTypeOptions.find(function (option) { return option.value === deal.deal_type; }) || { label: 'Deal' }).label;
        previewHeader.append(pill);
        previewCard.append(previewHeader);
        if (deal.price_text) {
          const price = document.createElement('div');
          price.className = 'structured-admin-editor__preview-price';
          price.textContent = deal.price_text;
          previewCard.append(price);
        }
        if (deal.description) {
          const description = document.createElement('div');
          description.className = 'structured-admin-editor__preview-copy';
          description.textContent = deal.description;
          previewCard.append(description);
        }
        if (deal.terms) {
          const terms = document.createElement('div');
          terms.className = 'structured-admin-editor__preview-meta';
          terms.textContent = 'Terms: ' + deal.terms;
          previewCard.append(terms);
        }
        formatHappyHourGroups(deal.happy_hours).forEach(function (group) {
          const groupRow = document.createElement('div');
          groupRow.className = 'structured-admin-editor__preview-meta';
          groupRow.textContent = group.dayLabel + ' | ' + group.timeLabel;
          previewCard.append(groupRow);
        });
        preview.append(previewCard);
        card.append(preview);

        const removeRow = document.createElement('div');
        removeRow.className = 'structured-admin-editor__button-row';
        removeRow.append(buildButton('Remove deal', 'structured-admin-editor__button--danger', function () {
          state.value.splice(dealIndex, 1);
          syncTextarea();
          renderDeals();
        }));
        card.append(removeRow);
        editorRoot.append(card);
      });
      const actions = document.createElement('div');
      actions.className = 'structured-admin-editor__button-row';
      actions.append(buildButton('Add deal or special', 'structured-admin-editor__button', function () {
        state.value.push(createEmptyDeal());
        syncTextarea();
        renderDeals();
      }));
      editorRoot.append(actions);
    }

    function renderHours() {
      editorRoot.innerHTML = '';
      if (!state.value.length) {
        const empty = document.createElement('div');
        empty.className = 'structured-admin-editor__empty';
        empty.textContent = 'No manual operating-hour overrides yet.';
        editorRoot.append(empty);
      }

      state.value.forEach(function (rowValue, rowIndex) {
        const card = document.createElement('div');
        card.className = 'structured-admin-editor__card';
        card.append(buildWeekdayButtons(rowValue.weekday, function (nextWeekday) {
          const existingWeekdays = getOperatingHourWeekdays(state.value[rowIndex]);
          const nextWeekdays = existingWeekdays.includes(nextWeekday)
            ? existingWeekdays.filter(function (weekday) { return weekday !== nextWeekday; })
            : existingWeekdays.concat([nextWeekday]).sort(function (left, right) { return left - right; });
          state.value[rowIndex].weekdays = nextWeekdays.length ? nextWeekdays : [nextWeekday];
          state.value[rowIndex].weekday = state.value[rowIndex].weekdays[0] || nextWeekday;
          syncTextarea();
          renderHours();
        }, getOperatingHourWeekdays(rowValue)));

        const timeRow = document.createElement('div');
        timeRow.className = 'structured-admin-editor__row structured-admin-editor__row--split';
        timeRow.append(buildInput('Open time', rowValue.open_time, function (nextValue) {
          state.value[rowIndex].open_time = nextValue;
          syncTextarea();
        }, { placeholder: '11:00 AM', timeFormat: '12hr' }));
        timeRow.append(buildInput('Close time', rowValue.close_time, function (nextValue) {
          state.value[rowIndex].close_time = nextValue;
          syncTextarea();
        }, { placeholder: '10:00 PM', timeFormat: '12hr' }));
        card.append(timeRow);
        card.append(buildButton('Remove hours row', 'structured-admin-editor__button--danger', function () {
          state.value.splice(rowIndex, 1);
          syncTextarea();
          renderHours();
        }));
        editorRoot.append(card);
      });

      if (state.value.length) {
        const preview = document.createElement('div');
        preview.className = 'structured-admin-editor__preview';
        formatOperatingHourGroups(state.value).forEach(function (group) {
          const previewCard = document.createElement('div');
          previewCard.className = 'structured-admin-editor__preview-card';
          previewCard.classList.add('structured-admin-editor__preview-card--hours');
          previewCard.textContent = group.dayLabel + ' | ' + group.timeLabel;
          preview.append(previewCard);
        });
        editorRoot.append(preview);
      }

      const actions = document.createElement('div');
      actions.className = 'structured-admin-editor__button-row';
      actions.append(buildButton('Add hours row', 'structured-admin-editor__button', function () {
        state.value.push(createEmptyHoursRow());
        syncTextarea();
        renderHours();
      }));
      editorRoot.append(actions);
    }

    if (!seededFromCurrentPublic) {
      syncTextarea();
    }
    if (type === 'deals') {
      renderDeals();
      return;
    }
    renderHours();
  }

  function initializeStructuredEditors() {
    document.querySelectorAll('textarea[data-structured-editor]').forEach(hydrateStructuredEditor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStructuredEditors);
  } else {
    initializeStructuredEditors();
  }
})();
