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

  function createEmptyMenuItem() {
    return {
      id: createId('menu-item'),
      name: '',
      price: '',
      detail: '',
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
      description_price: '',
      terms: '',
      menu_items: [],
      happy_hours: [createEmptyHappyHour()],
    };
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function getMenuItemWeekdays(item) {
    return Array.from(new Set((Array.isArray(item.weekdays) ? item.weekdays : []).filter(function (day) {
      return Number.isInteger(day) && day >= 0 && day <= 6;
    }))).sort(function (left, right) { return left - right; });
  }

  function formatMenuItemWeekdays(item) {
    const days = getMenuItemWeekdays(item);
    const fullLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days.length === 1
      ? fullLabels[days[0]]
      : days.map(function (day) { return weekdayOptions[day].label; }).join(', ');
  }

  function getMenuItemSort(item) {
    if (getMenuItemWeekdays(item).length) {
      return { kind: 'other', amount: null };
    }
    const name = String(item.name || '').trim();
    const price = String(item.price || '').trim();
    const detail = String(item.detail || '').trim();
    if (!name || name.length > 120 || !/[A-Za-z\u00c0-\u00ff]/.test(name) || /[$:;!?]/.test(name)
      || /^(?:terms?|notes?|restrictions?|please|ask|see|visit|available|subject|prices?)\b/i.test(name)) {
      return { kind: 'other', amount: null };
    }
    if (/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?\s+off$/i.test(price)) {
      return { kind: 'discount', amount: null };
    }
    const amount = price.match(/^\$(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:\s+each)?$/i);
    const cents = amount ? Math.round(Number(amount[1].replace(/,/g, '')) * 100) : null;
    const contextualPrice = /\b(?:for|from|at|only|save|starting at|up to|as low as|under)\s*$|^(?:add|extra|upgrade)\b|%/i;
    const weekday = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|Sat|Sun)\b/i;
    const time = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
    const isUnambiguous = amount
      && Number.isSafeInteger(cents)
      && !contextualPrice.test(name)
      && !weekday.test(name)
      && !weekday.test(detail)
      && !time.test(name)
      && !time.test(detail);
    return isUnambiguous
      ? { kind: 'cost', amount: cents }
      : { kind: 'other', amount: null };
  }

  function sortMenuItemsForPreview(items) {
    const result = [];
    let menu = [];
    function flushMenu() {
      const priced = menu
        .map(function (entry, index) { return { entry: entry, index: index }; })
        .filter(function (entry) { return entry.entry.sort.kind === 'cost'; })
        .sort(function (left, right) {
          return (left.entry.sort.amount - right.entry.sort.amount) || (left.index - right.index);
        });
      let priceIndex = 0;
      result.push.apply(result, menu.map(function (entry) {
        return entry.sort.kind === 'cost' ? priced[priceIndex++].entry.item : entry.item;
      }));
      menu = [];
    }
    (items || []).forEach(function (item) {
      const sort = getMenuItemSort(item);
      if (sort.kind === 'other') {
        flushMenu();
        result.push(item);
      } else {
        menu.push({ item: item, sort: sort });
      }
    });
    flushMenu();
    return result;
  }

  function createEmptyHoursRow() {
    return {
      id: createId('hours'),
      group_id: createId('hours-group'),
      weekdays: [0],
      weekday: 0,
      open_time: '11:00 AM',
      close_time: '10:00 PM',
      open_24_hours: false,
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

  function getOperatingHoursForDealPreview() {
    const textarea = document.querySelector('textarea[data-structured-editor="hours"]');
    if (!textarea) {
      return [];
    }
    const currentRows = safeJsonParse(textarea.value);
    if (currentRows !== null) {
      return currentRows;
    }
    return safeJsonParse(textarea.dataset.initialJson || '[]') || [];
  }

  function isDealEndBusinessClose(endTime, weekdays, operatingHours) {
    if (String(endTime) === '23:59') {
      return true;
    }
    if (!weekdays.length || !operatingHours.length) {
      return false;
    }
    const closeTimesByWeekday = new Map();
    operatingHours.forEach(function (row) {
      getOperatingHourWeekdays(row).forEach(function (weekday) {
        closeTimesByWeekday.set(weekday, row.close_time);
      });
    });
    return weekdays.every(function (weekday) {
      const closeTime = closeTimesByWeekday.get(weekday);
      return closeTime !== undefined && normalizeTimeInput(closeTime) === normalizeTimeInput(endTime);
    });
  }

  function formatHappyHourGroups(happyHours, operatingHours) {
    const grouped = new Map();
    happyHours.forEach(function (window) {
      const key = window.all_day ? 'all-day' : String(window.start_time) + '-' + String(window.end_time);
      const items = grouped.get(key) || [];
      items.push(window);
      grouped.set(key, items);
    });
    return Array.from(grouped.values()).map(function (group, index) {
      const weekdays = group.flatMap(function (window) { return getWindowWeekdays(window); });
      const endLabel = isDealEndBusinessClose(group[0].end_time, weekdays, operatingHours || [])
        ? 'Close'
        : formatTime(group[0].end_time);
      return {
        id: 'group-' + index,
        dayLabel: formatWeekdayRange(weekdays),
        timeLabel: group[0].all_day ? 'All day' : formatTime(group[0].start_time) + ' - ' + endLabel,
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
        description_price: String(deal.description_price || ''),
        menu_items: (Array.isArray(deal.menu_items) ? deal.menu_items : []).map(function (item) {
          const weekdays = getMenuItemWeekdays(item);
          return Object.assign({}, item, {
            id: item.id || createId('menu-item'),
            name: String(item.name || ''),
            price: String(item.price || ''),
            detail: String(item.detail || ''),
            weekdays: weekdays,
            _showWeekdays: weekdays.length > 0,
            _previousWeekdays: weekdays,
          });
        }),
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
      const serializedDeal = {
        title: deal.title,
        description: deal.description,
        deal_type: deal.deal_type,
        custom_deal_type_label: deal.custom_deal_type_label || '',
        price_text: deal.price_text,
        terms: deal.terms,
        menu_items: (deal.menu_items || [])
          .map(function (item) {
            const serializedItem = {
              name: String(item.name || '').trim(),
              price: String(item.price || '').trim(),
              detail: String(item.detail || '').trim(),
            };
            const weekdays = getMenuItemWeekdays(item);
            if (weekdays.length) {
              serializedItem.weekdays = weekdays;
            }
            return serializedItem;
          })
          .filter(function (item) { return item.name || item.price || item.detail; }),
        happy_hours: serializedHappyHours,
      };
      if (Object.prototype.hasOwnProperty.call(deal, 'attachment')) {
        serializedDeal.attachment = deal.attachment;
      }
      const descriptionPrice = String(deal.description_price || '').trim();
      if (descriptionPrice) {
        serializedDeal.description_price = descriptionPrice;
      }
      return serializedDeal;
    });
  }

  function formatOperatingHourGroups(rows) {
    return (rows || []).map(function (row, index) {
      return {
        id: row.group_id || 'hours-' + index,
        dayLabel: formatWeekdayRange(getOperatingHourWeekdays(row)),
        timeLabel: row.open_24_hours ? 'Open 24 hours' : formatTime(row.open_time) + ' - ' + formatTime(row.close_time),
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
      const key = row.group_id ? 'group:' + String(row.group_id) : (row.open_24_hours ? '24hr' : 'timed') + '|' + String(row.open_time || '') + '|' + String(row.close_time || '');
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
        open_24_hours: Boolean(row.open_24_hours),
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
          open_time: row.open_24_hours ? '00:00' : row.open_time,
          close_time: row.open_24_hours ? '23:59' : row.close_time,
          open_24_hours: Boolean(row.open_24_hours),
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

  function parseLineSeparatedList(rawValue) {
    return String(rawValue || '')
      .split(/\r?\n/)
      .map(function (value) { return String(value || '').trim(); })
      .filter(function (value, index, values) { return value && values.indexOf(value) === index; });
  }

  function hydrateImportedImageGallery(textarea) {
    if (!textarea.dataset.imageGalleryEditor) {
      return;
    }

    const state = {
      images: parseLineSeparatedList(textarea.value),
      deleted: new Set(),
    };

    textarea.classList.add('is-structured-enhanced');

    const editorRoot = document.createElement('div');
    editorRoot.className = 'structured-admin-image-editor';
    textarea.insertAdjacentElement('afterend', editorRoot);

    function syncTextarea() {
      textarea.value = state.images.filter(function (url) {
        return !state.deleted.has(url);
      }).join('\n');
    }

    function render() {
      clearChildren(editorRoot);

      if (!state.images.length) {
        const empty = document.createElement('div');
        empty.className = 'structured-admin-editor__empty';
        empty.textContent = 'No imported images are stored for this business.';
        editorRoot.append(empty);
        syncTextarea();
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'structured-admin-image-editor__grid';

      state.images.forEach(function (imageUrl, index) {
        const pendingDelete = state.deleted.has(imageUrl);

        const card = document.createElement('div');
        card.className = 'structured-admin-image-editor__card' + (pendingDelete ? ' is-pending-delete' : '');

        const imageWrap = document.createElement('div');
        imageWrap.className = 'structured-admin-image-editor__image-wrap';
        const image = document.createElement('img');
        image.className = 'structured-admin-image-editor__image';
        image.src = imageUrl;
        image.alt = 'Imported business image ' + (index + 1);
        image.loading = 'lazy';
        imageWrap.append(image);
        if (pendingDelete) {
          const badge = document.createElement('div');
          badge.className = 'structured-admin-image-editor__badge';
          badge.textContent = 'Will delete';
          imageWrap.append(badge);
        }
        card.append(imageWrap);

        const meta = document.createElement('div');
        meta.className = 'structured-admin-image-editor__meta';
        const title = document.createElement('div');
        title.className = 'structured-admin-image-editor__title';
        title.textContent = 'Imported image ' + (index + 1);
        meta.append(title);
        const copy = document.createElement('div');
        copy.className = 'structured-admin-image-editor__copy';
        copy.textContent = imageUrl;
        meta.append(copy);
        card.append(meta);

        const actions = document.createElement('div');
        actions.className = 'structured-admin-image-editor__actions';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'structured-admin-image-editor__button--danger';
        deleteButton.textContent = 'Delete image';
        deleteButton.hidden = pendingDelete;
        deleteButton.addEventListener('click', function () {
          state.deleted.add(imageUrl);
          syncTextarea();
          render();
        });
        actions.append(deleteButton);

        const undoButton = document.createElement('button');
        undoButton.type = 'button';
        undoButton.className = 'structured-admin-image-editor__button--undo';
        undoButton.textContent = 'Undo';
        undoButton.hidden = !pendingDelete;
        undoButton.addEventListener('click', function () {
          state.deleted.delete(imageUrl);
          syncTextarea();
          render();
        });
        actions.append(undoButton);
        card.append(actions);

        const status = document.createElement('div');
        status.className = 'structured-admin-image-editor__status';
        status.textContent = pendingDelete
          ? 'This image will be removed when you save. Undo to keep it.'
          : 'Delete this pulled image to suppress it from future pulls.';
        card.append(status);

        grid.append(card);
      });

      editorRoot.append(grid);
      syncTextarea();
    }

    render();
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
    const touchedInput = document.createElement('input');
    touchedInput.type = 'hidden';
    touchedInput.name = textarea.name + '_touched';
    touchedInput.value = '0';
    textarea.insertAdjacentElement('afterend', touchedInput);
    const editorRoot = document.createElement('div');
    editorRoot.className = 'structured-admin-editor';
    if (type === 'deals' || type === 'hours') {
      editorRoot.classList.add('structured-admin-editor--branded', 'structured-admin-editor--' + type);
    }
    textarea.insertAdjacentElement('afterend', editorRoot);
    const dealDisclosureState = new WeakMap();
    const dealPreviewRefreshers = [];

    function markTouched() {
      touchedInput.value = '1';
    }

    function syncTextarea() {
      textarea.value = JSON.stringify(type === 'deals' ? serializeDealsForTextarea(state.value) : serializeHoursForTextarea(state.value));
      if (type === 'hours') {
        document.dispatchEvent(new Event('structured-admin-hours-change'));
      }
    }

    if (type === 'deals') {
      document.addEventListener('structured-admin-hours-change', function () {
        dealPreviewRefreshers.forEach(function (refresh) { refresh(); });
      });
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
      if (options && options.maxLength) {
        element.maxLength = options.maxLength;
      }
      element.addEventListener('input', function () {
        markTouched();
        onInput(uses12HourTime ? normalizeTimeInput(element.value) : element.value);
        if (options && options.onInput) {
          options.onInput();
        }
      });
      if (uses12HourTime || (options && options.onBlur)) {
        element.addEventListener('blur', function () {
          markTouched();
          if (uses12HourTime) {
            const normalizedValue = normalizeTimeInput(element.value);
            onInput(normalizedValue);
            element.value = formatTime(normalizedValue);
          }
          if (options && options.onBlur) {
            options.onBlur();
          }
        });
      }
      label.append(element);
      return label;
    }

    function buildSelect(labelText, value, optionList, onChange) {
      // Keep the existing browser-owned picker, including its native keyboard behavior.
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
      select.addEventListener('change', function () { markTouched(); onChange(select.value); });
      label.append(select);
      return label;
    }

    function buildWeekdayButtons(selectedWeekday, onSelect, selectedWeekdays, labelPrefix) {
      const activeWeekdays = Array.isArray(selectedWeekdays)
        ? selectedWeekdays
        : [selectedWeekday];
      const row = document.createElement('div');
      row.className = 'structured-admin-editor__weekday-row';
      weekdayOptions.forEach(function (option) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'structured-admin-editor__weekday-button' + (activeWeekdays.includes(option.value) ? ' is-active' : '');
        button.textContent = option.label;
        button.setAttribute('aria-pressed', String(activeWeekdays.includes(option.value)));
        if (labelPrefix) {
          button.setAttribute('aria-label', labelPrefix + ' ' + option.label);
        }
        button.addEventListener('click', function () { markTouched(); onSelect(option.value); });
        row.append(button);
      });
      return row;
    }

    function buildButton(labelText, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = labelText;
      button.addEventListener('click', function () { markTouched(); onClick(); });
      return button;
    }

    function buildHelp(copy) {
      const help = document.createElement('div');
      help.className = 'structured-admin-editor__help';
      help.textContent = copy;
      return help;
    }

    function buildDealSection(step, title, copy) {
      const section = document.createElement('section');
      section.className = 'structured-admin-editor__deal-section';
      const heading = document.createElement('h4');
      heading.className = 'structured-admin-editor__step-heading';
      const number = document.createElement('span');
      number.className = 'structured-admin-editor__step';
      number.textContent = String(step);
      heading.append(number, document.createTextNode(title));
      section.append(heading, buildHelp(copy));
      return section;
    }

    function buildDealDisclosure(deal, key, title, copy, hasContent) {
      const remembered = dealDisclosureState.get(deal) || {};
      const details = document.createElement('details');
      details.className = 'structured-admin-editor__disclosure';
      details.open = key in remembered ? remembered[key] : Boolean(hasContent);
      const summary = document.createElement('summary');
      summary.className = 'structured-admin-editor__disclosure-trigger';
      const summaryCopy = document.createElement('span');
      summaryCopy.textContent = title;
      const optional = document.createElement('small');
      optional.textContent = 'Optional';
      summaryCopy.append(optional);
      summary.append(summaryCopy);
      const content = document.createElement('div');
      content.className = 'structured-admin-editor__disclosure-content';
      content.append(buildHelp(copy));
      details.append(summary, content);
      details.addEventListener('toggle', function () {
        dealDisclosureState.set(deal, Object.assign({}, dealDisclosureState.get(deal), { [key]: details.open }));
      });
      return { root: details, content: content };
    }

    function renderDeals() {
      clearChildren(editorRoot);
      dealPreviewRefreshers.length = 0;
      if (!state.value.length) {
        const empty = document.createElement('div');
        empty.className = 'structured-admin-editor__empty';
        empty.textContent = 'No manual deal overrides yet.';
        editorRoot.append(empty);
      }

      state.value.forEach(function (deal, dealIndex) {
        const card = document.createElement('div');
        card.className = 'structured-admin-editor__card';
        const eyebrow = document.createElement('div');
        eyebrow.className = 'structured-admin-editor__eyebrow';
        eyebrow.textContent = 'DEAL ' + (dealIndex + 1);
        card.append(eyebrow);
        let preview = null;

        function refreshDealPreview() {
          if (!preview) {
            return;
          }
          clearChildren(preview);
          const previewCard = document.createElement('div');
          previewCard.className = 'structured-admin-editor__preview-card';
          const previewHeader = document.createElement('div');
          previewHeader.className = 'structured-admin-editor__preview-header';
          const actions = document.createElement('div');
          actions.className = 'structured-admin-editor__preview-actions';
          actions.setAttribute('aria-hidden', 'true');
          const calendarAction = document.createElement('span');
          calendarAction.className = 'structured-admin-editor__preview-action-icon';
          const calendarIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          calendarIcon.setAttribute('viewBox', '0 0 24 24');
          calendarIcon.setAttribute('fill', 'none');
          calendarIcon.setAttribute('stroke', 'currentColor');
          calendarIcon.setAttribute('stroke-width', '1.8');
          calendarIcon.setAttribute('stroke-linecap', 'round');
          calendarIcon.setAttribute('stroke-linejoin', 'round');
          const calendarBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          calendarBody.setAttribute('x', '4');
          calendarBody.setAttribute('y', '5');
          calendarBody.setAttribute('width', '16');
          calendarBody.setAttribute('height', '16');
          calendarBody.setAttribute('rx', '2');
          const calendarTop = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          calendarTop.setAttribute('d', 'M8 3v4m8-4v4M4 10h16');
          calendarIcon.append(calendarBody, calendarTop);
          calendarAction.append(calendarIcon);
          const shareAction = document.createElement('span');
          shareAction.className = 'structured-admin-editor__preview-action-icon';
          const shareIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          shareIcon.setAttribute('viewBox', '0 0 24 24');
          shareIcon.setAttribute('fill', 'none');
          shareIcon.setAttribute('stroke', 'currentColor');
          shareIcon.setAttribute('stroke-width', '1.8');
          shareIcon.setAttribute('stroke-linecap', 'round');
          shareIcon.setAttribute('stroke-linejoin', 'round');
          const sharePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          sharePath.setAttribute('d', 'M8 12l8-5M8 12l8 5');
          const shareNodes = [
            { cx: '6', cy: '12' },
            { cx: '18', cy: '5' },
            { cx: '18', cy: '19' },
          ].map(function (coordinates) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', coordinates.cx);
            circle.setAttribute('cy', coordinates.cy);
            circle.setAttribute('r', '3');
            return circle;
          });
          shareIcon.append(sharePath);
          shareNodes.forEach(function (node) { shareIcon.append(node); });
          shareAction.append(shareIcon);
          actions.append(calendarAction, shareAction);
          const title = document.createElement('strong');
          title.className = 'structured-admin-editor__preview-title';
          title.textContent = deal.title || 'Untitled deal';
          const pill = document.createElement('span');
          pill.className = 'structured-admin-editor__pill';
          pill.textContent = deal.custom_deal_type_label || (dealTypeOptions.find(function (option) { return option.value === deal.deal_type; }) || { label: 'Deal' }).label;
          previewHeader.append(actions, pill);
          previewCard.append(previewHeader);
          const titlePriceRow = document.createElement('div');
          titlePriceRow.className = 'structured-admin-editor__preview-title-price-row';
          titlePriceRow.append(title);
          if (deal.price_text) {
            const price = document.createElement('div');
            price.className = 'structured-admin-editor__preview-price';
            price.textContent = deal.price_text;
            titlePriceRow.append(price);
          }
          previewCard.append(titlePriceRow);
          if (deal.description) {
            if (deal.description_price) {
              const descriptionLine = document.createElement('div');
              descriptionLine.className = 'structured-admin-editor__preview-menu-line structured-admin-editor__preview-description-line';
              const description = document.createElement('div');
              description.className = 'structured-admin-editor__preview-copy';
              description.textContent = deal.description;
              const descriptionPrice = document.createElement('strong');
              descriptionPrice.className = 'structured-admin-editor__preview-menu-price';
              descriptionPrice.textContent = deal.description_price;
              descriptionLine.append(description, descriptionPrice);
              previewCard.append(descriptionLine);
            } else {
              const description = document.createElement('div');
              description.className = 'structured-admin-editor__preview-copy';
              description.textContent = deal.description;
              previewCard.append(description);
            }
          }
          const previewMenu = document.createElement('div');
          previewMenu.className = 'structured-admin-editor__preview-menu';
          sortMenuItemsForPreview((deal.menu_items || []).filter(function (item) { return String(item.name || '').trim(); })).forEach(function (item) {
            const menuRow = document.createElement('div');
            const dayLabel = formatMenuItemWeekdays(item);
            if (dayLabel) {
              menuRow.className = 'structured-admin-editor__preview-weekday-row';
              const label = document.createElement('span');
              label.className = 'structured-admin-editor__preview-weekday-label';
              label.textContent = dayLabel;
              const offer = document.createElement('div');
              offer.className = 'structured-admin-editor__preview-copy';
              offer.textContent = [String(item.name || '').trim(), String(item.price || '').trim(), item.detail ? '(' + String(item.detail).trim() + ')' : ''].filter(Boolean).join(' ');
              menuRow.append(label, offer);
              previewMenu.append(menuRow);
              return;
            }
            menuRow.className = 'structured-admin-editor__preview-menu-item';
            const menuLine = document.createElement('div');
            menuLine.className = 'structured-admin-editor__preview-menu-line';
            const menuName = document.createElement('strong');
            menuName.className = 'structured-admin-editor__preview-menu-name';
            menuName.textContent = item.name;
            menuLine.append(menuName);
            if (item.price) {
              const menuPrice = document.createElement('strong');
              menuPrice.className = 'structured-admin-editor__preview-menu-price';
              menuPrice.textContent = item.price;
              menuLine.append(menuPrice);
            }
            menuRow.append(menuLine);
            if (item.detail) {
              const menuDetail = document.createElement('div');
              menuDetail.className = 'structured-admin-editor__preview-menu-detail';
              menuDetail.textContent = item.detail;
              menuRow.append(menuDetail);
            }
            previewMenu.append(menuRow);
          });
          if (previewMenu.childNodes.length) {
            previewCard.append(previewMenu);
          }
          if (deal.terms) {
            const terms = document.createElement('div');
            terms.className = 'structured-admin-editor__preview-meta';
            terms.textContent = 'Terms: ' + deal.terms;
            previewCard.append(terms);
          }
          const scheduleGroups = formatHappyHourGroups(deal.happy_hours, getOperatingHoursForDealPreview());
          if (scheduleGroups.length) {
            const schedule = document.createElement('div');
            schedule.className = 'structured-admin-editor__preview-schedule';
            scheduleGroups.forEach(function (group) {
              const groupRow = document.createElement('div');
              groupRow.className = 'structured-admin-editor__preview-schedule-row';
              const days = document.createElement('strong');
              days.className = 'structured-admin-editor__preview-schedule-days';
              days.textContent = group.dayLabel;
              const time = document.createElement('span');
              time.className = 'structured-admin-editor__preview-schedule-time';
              time.textContent = group.timeLabel;
              groupRow.append(days, time);
              schedule.append(groupRow);
            });
            previewCard.append(schedule);
          }
          preview.append(previewCard);
        }
        dealPreviewRefreshers.push(refreshDealPreview);

        const headingSection = buildDealSection(1, 'Name the promotion', 'This is the heading of the whole deal card, not an individual food or drink.');
        const row = document.createElement('div');
        row.className = 'structured-admin-editor__row structured-admin-editor__row--split';
        row.append(buildInput('Deal title', deal.title, function (nextValue) {
          state.value[dealIndex].title = nextValue;
          syncTextarea();
        }, { onInput: refreshDealPreview, placeholder: 'For example, Happy Hour Menu' }));
        row.append(buildSelect('Deal type', deal.deal_type || 'happy_hour', dealTypeOptions, function (nextValue) {
          state.value[dealIndex].deal_type = nextValue;
          if (nextValue !== 'other') {
            state.value[dealIndex].custom_deal_type_label = '';
          }
          syncTextarea();
          renderDeals();
        }));
        headingSection.append(row);

        if ((deal.deal_type || 'happy_hour') === 'other') {
          headingSection.append(buildInput('Custom deal type', deal.custom_deal_type_label, function (nextValue) {
            state.value[dealIndex].custom_deal_type_label = nextValue;
            syncTextarea();
          }, { onInput: refreshDealPreview, placeholder: 'For example, Taco Tuesday' }));
        }

        const headlinePrice = buildDealDisclosure(deal, 'headline', 'Price label beside the deal title', 'A summary price or savings for the whole promotion. Individual item prices go in step 2.', deal.price_text);
        headlinePrice.content.append(buildInput('Headline price or savings', deal.price_text, function (nextValue) {
          state.value[dealIndex].price_text = nextValue;
          syncTextarea();
        }, { onInput: refreshDealPreview, placeholder: 'For example, $4–$7 or 20% off' }));
        headingSection.append(headlinePrice.root);
        card.append(headingSection);

        const contentsSection = buildDealSection(2, 'What customers get', 'For a menu, add each food or drink below. For one overall offer, use “Single offer or general note.”');
        const menuHeading = document.createElement('div');
        menuHeading.className = 'structured-admin-editor__entry-heading';
        const menuLabel = document.createElement('strong');
        menuLabel.textContent = 'Menu items';
        const itemCount = document.createElement('span');
        itemCount.className = 'structured-admin-editor__help';
        itemCount.textContent = (deal.menu_items || []).length + ' / 50';
        menuHeading.append(menuLabel, itemCount);
        contentsSection.append(menuHeading);

        deal.menu_items = Array.isArray(deal.menu_items) ? deal.menu_items : [];
        deal.menu_items.forEach(function (item, itemIndex) {
          const itemCard = document.createElement('div');
          itemCard.className = 'structured-admin-editor__deal-entry';
          const itemHeading = document.createElement('div');
          itemHeading.className = 'structured-admin-editor__entry-heading';
          const itemNumber = document.createElement('span');
          itemNumber.className = 'structured-admin-editor__eyebrow';
          itemNumber.textContent = 'ITEM ' + (itemIndex + 1);
          const removeItem = buildButton('Remove item', 'structured-admin-editor__button--danger', function () {
            state.value[dealIndex].menu_items.splice(itemIndex, 1);
            syncTextarea();
            renderDeals();
          });
          removeItem.setAttribute('aria-label', 'Remove menu item ' + (itemIndex + 1));
          itemHeading.append(itemNumber, removeItem);
          itemCard.append(itemHeading);
          const showDays = item._showWeekdays || getMenuItemWeekdays(item).length > 0;
          const itemLabel = 'Deal ' + (dealIndex + 1) + ' menu item ' + (itemIndex + 1);
          function renderItemChoice(focusLabel) {
            syncTextarea();
            renderDeals();
            const button = Array.from(editorRoot.querySelectorAll('button')).find(function (candidate) {
              return candidate.getAttribute('aria-label') === focusLabel;
            });
            if (button) {
              button.focus({ preventScroll: true });
            }
          }
          const itemRow = document.createElement('div');
          itemRow.className = 'structured-admin-editor__row structured-admin-editor__row--split';
          itemRow.append(buildInput('Item name', item.name, function (nextValue) {
            state.value[dealIndex].menu_items[itemIndex].name = nextValue;
            syncTextarea();
          }, { maxLength: 120, onInput: refreshDealPreview, placeholder: 'For example, House margarita' }));
          itemRow.append(buildInput(showDays ? 'Price in offer text (optional)' : 'Item price or savings', item.price, function (nextValue) {
            state.value[dealIndex].menu_items[itemIndex].price = nextValue;
            syncTextarea();
          }, { maxLength: 120, onInput: refreshDealPreview, placeholder: 'For example, $8 or $2 off' }));
          itemCard.append(itemRow);
          const layoutLabel = document.createElement('strong');
          layoutLabel.className = 'structured-admin-editor__label';
          layoutLabel.textContent = 'Display beside this item';
          const layoutChoices = document.createElement('div');
          layoutChoices.className = 'structured-admin-editor__weekday-row';
          layoutChoices.setAttribute('role', 'group');
          layoutChoices.setAttribute('aria-label', itemLabel + ' display layout');
          [{ label: 'Price column', days: false }, { label: 'Weekday label', days: true }].forEach(function (option) {
            const focusLabel = itemLabel + ' ' + option.label.toLowerCase();
            const choice = buildButton(option.label, 'structured-admin-editor__weekday-button' + (Boolean(showDays) === option.days ? ' is-active' : ''), function () {
              if (Boolean(showDays) === option.days) {
                return;
              }
              item._showWeekdays = option.days;
              if (option.days) {
                item.weekdays = item._previousWeekdays || [];
              } else {
                item._previousWeekdays = getMenuItemWeekdays(item);
                delete item.weekdays;
              }
              renderItemChoice(focusLabel);
            });
            choice.setAttribute('aria-pressed', String(Boolean(showDays) === option.days));
            choice.setAttribute('aria-label', focusLabel);
            layoutChoices.append(choice);
          });
          itemCard.append(layoutLabel, layoutChoices);
          if (showDays) {
            itemCard.append(buildHelp("Choose the days shown beside this offer. Its price stays in the offer text, not a separate column. Set the deal's overall schedule in step 3."));
            itemCard.append(buildWeekdayButtons(undefined, function (day) {
              const days = getMenuItemWeekdays(item);
              item.weekdays = days.includes(day) ? days.filter(function (value) { return value !== day; }) : days.concat(day).sort(function (left, right) { return left - right; });
              item._previousWeekdays = item.weekdays;
              renderItemChoice(itemLabel + ' ' + weekdayOptions[day].label);
            }, getMenuItemWeekdays(item), itemLabel));
          }
          itemCard.append(buildInput('Item details (optional)', item.detail, function (nextValue) {
            state.value[dealIndex].menu_items[itemIndex].detail = nextValue;
            syncTextarea();
          }, { multiline: true, maxLength: 4000, onInput: refreshDealPreview, placeholder: 'What is included?' }));
          contentsSection.append(itemCard);
        });

        const menuActions = document.createElement('div');
        menuActions.className = 'structured-admin-editor__button-row';
        const addMenuItem = buildButton('Add menu item', 'structured-admin-editor__button', function () {
          state.value[dealIndex].menu_items.push(createEmptyMenuItem());
          syncTextarea();
          renderDeals();
        });
        addMenuItem.disabled = deal.menu_items.length >= 50;
        if (addMenuItem.disabled) {
          addMenuItem.title = 'A deal can have up to 50 menu items.';
        }
        menuActions.append(addMenuItem);
        contentsSection.append(menuActions, buildHelp('Names, prices, and details are formatted automatically in the public profile. No special spacing needed.'));
        const generalNote = buildDealDisclosure(deal, 'note', 'Single offer or general note', 'Use this for one offer, such as half-price appetizers, or a note that applies to all menu items.', deal.description || deal.description_price);
        generalNote.content.append(buildInput('Overall offer or note', deal.description, function (nextValue) {
          state.value[dealIndex].description = nextValue;
          syncTextarea();
        }, { multiline: true, maxLength: 4000, onInput: refreshDealPreview, placeholder: 'For example, Half-price appetizers at the bar' }));
        generalNote.content.append(buildInput('Price for this offer (optional)', deal.description_price, function (nextValue) {
          state.value[dealIndex].description_price = nextValue;
          syncTextarea();
        }, { maxLength: 120, onInput: refreshDealPreview, placeholder: 'For example, $5 or 50% off' }));
        contentsSection.append(generalNote.root);
        card.append(contentsSection);

        const availabilitySection = buildDealSection(3, 'Availability & restrictions', 'Choose when this deal is available and add any rules customers should know.');
        availabilitySection.append(buildInput('Terms or restrictions (optional)', deal.terms, function (nextValue) {
          state.value[dealIndex].terms = nextValue;
          syncTextarea();
        }, { onInput: refreshDealPreview, placeholder: 'For example, Dine-in only · Bar and patio' }));

        deal.happy_hours = Array.isArray(deal.happy_hours) ? deal.happy_hours : [];
        deal.happy_hours.forEach(function (window, windowIndex) {
          const nestedCard = document.createElement('div');
          nestedCard.className = 'structured-admin-editor__deal-entry';
          const scheduleNumber = document.createElement('div');
          scheduleNumber.className = 'structured-admin-editor__eyebrow';
          scheduleNumber.textContent = 'SCHEDULE ' + (windowIndex + 1);
          const daysLabel = document.createElement('strong');
          daysLabel.textContent = 'Available days';
          nestedCard.append(scheduleNumber, daysLabel);
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
          const allDayButton = buildButton('All day', 'structured-admin-editor__toggle' + (window.all_day ? ' is-active' : ''), function () {
            state.value[dealIndex].happy_hours[windowIndex].all_day = !state.value[dealIndex].happy_hours[windowIndex].all_day;
            syncTextarea();
            renderDeals();
          });
          allDayButton.setAttribute('aria-pressed', String(Boolean(window.all_day)));
          toggleRow.append(allDayButton);
          nestedCard.append(toggleRow);

          if (!window.all_day) {
            const timeRow = document.createElement('div');
            timeRow.className = 'structured-admin-editor__row structured-admin-editor__row--split';
            timeRow.append(buildInput('Start time', window.start_time, function (nextValue) {
              state.value[dealIndex].happy_hours[windowIndex].start_time = nextValue;
              syncTextarea();
            }, { placeholder: '3:00 PM', timeFormat: '12hr', onInput: refreshDealPreview }));
            timeRow.append(buildInput('End time', window.end_time, function (nextValue) {
              state.value[dealIndex].happy_hours[windowIndex].end_time = nextValue;
              syncTextarea();
            }, { placeholder: '6:00 PM', timeFormat: '12hr', onInput: refreshDealPreview }));
            nestedCard.append(timeRow);
          }

          nestedCard.append(buildButton('Remove day/time', 'structured-admin-editor__button--danger', function () {
            state.value[dealIndex].happy_hours.splice(windowIndex, 1);
            syncTextarea();
            renderDeals();
          }));
          availabilitySection.append(nestedCard);
        });

        const happyHourButtonRow = document.createElement('div');
        happyHourButtonRow.className = 'structured-admin-editor__button-row';
        happyHourButtonRow.append(buildButton('Add deal day/time', 'structured-admin-editor__button', function () {
          state.value[dealIndex].happy_hours.push(createEmptyHappyHour());
          syncTextarea();
          renderDeals();
        }));
        availabilitySection.append(happyHourButtonRow);
        card.append(availabilitySection);

        const previewSection = buildDealSection(4, 'Check your deal', 'Review the formatted content below. Your changes are saved when you submit the form.');
        preview = document.createElement('div');
        preview.className = 'structured-admin-editor__preview';
        refreshDealPreview();
        previewSection.append(preview);
        card.append(previewSection);

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
      clearChildren(editorRoot);
      let previewRows = null;

      function refreshHoursPreview() {
        if (!previewRows) {
          return;
        }
        clearChildren(previewRows);
        formatOperatingHourGroups(state.value).forEach(function (group) {
          const previewRow = document.createElement('div');
          previewRow.className = 'structured-admin-editor__hours-preview-row';
          const days = document.createElement('strong');
          days.className = 'structured-admin-editor__preview-weekday-label';
          days.textContent = group.dayLabel;
          const hours = document.createElement('span');
          hours.className = 'structured-admin-editor__hours-preview-time';
          hours.textContent = group.timeLabel;
          previewRow.append(days, hours);
          previewRows.append(previewRow);
        });
      }

      const intro = document.createElement('div');
      intro.className = 'structured-admin-editor__hours-intro';
      const introHeading = document.createElement('h3');
      introHeading.className = 'structured-admin-editor__step-heading';
      introHeading.textContent = 'Set weekly hours';
      intro.append(introHeading, buildHelp('Group days that share the same opening and closing times. The customer preview updates as you edit.'));
      editorRoot.append(intro);

      if (!state.value.length) {
        const empty = document.createElement('div');
        empty.className = 'structured-admin-editor__empty';
        empty.textContent = 'No manual operating-hour overrides yet.';
        editorRoot.append(empty);
      }

      state.value.forEach(function (rowValue, rowIndex) {
        const card = document.createElement('div');
        card.className = 'structured-admin-editor__card structured-admin-editor__hours-row';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', 'Schedule ' + (rowIndex + 1));
        const scheduleNumber = document.createElement('div');
        scheduleNumber.className = 'structured-admin-editor__eyebrow';
        scheduleNumber.textContent = 'SCHEDULE ' + (rowIndex + 1);
        const daysLabel = document.createElement('strong');
        daysLabel.className = 'structured-admin-editor__hours-field-heading';
        daysLabel.textContent = 'Days open';
        card.append(scheduleNumber, daysLabel);
        card.append(buildWeekdayButtons(rowValue.weekday, function (nextWeekday) {
          const existingWeekdays = getOperatingHourWeekdays(state.value[rowIndex]);
          const nextWeekdays = existingWeekdays.includes(nextWeekday)
            ? existingWeekdays.filter(function (weekday) { return weekday !== nextWeekday; })
            : existingWeekdays.concat([nextWeekday]).sort(function (left, right) { return left - right; });
          state.value[rowIndex].weekdays = nextWeekdays.length ? nextWeekdays : [nextWeekday];
          state.value[rowIndex].weekday = state.value[rowIndex].weekdays[0] || nextWeekday;
          syncTextarea();
          renderHours();
        }, getOperatingHourWeekdays(rowValue), 'Schedule ' + (rowIndex + 1)));

        const toggleRow = document.createElement('div');
        toggleRow.className = 'structured-admin-editor__inline-toggle-row';
        const allDayButton = buildButton('Open 24 hours', 'structured-admin-editor__toggle' + (rowValue.open_24_hours ? ' is-active' : ''), function () {
          state.value[rowIndex].open_24_hours = !state.value[rowIndex].open_24_hours;
          if (state.value[rowIndex].open_24_hours) {
            state.value[rowIndex].open_time = '00:00';
            state.value[rowIndex].close_time = '23:59';
          }
          syncTextarea();
          renderHours();
        });
        allDayButton.setAttribute('aria-label', 'Schedule ' + (rowIndex + 1) + ' open 24 hours');
        allDayButton.setAttribute('aria-pressed', String(Boolean(rowValue.open_24_hours)));
        toggleRow.append(allDayButton);
        card.append(toggleRow);

        if (!rowValue.open_24_hours) {
          const timeRow = document.createElement('div');
          timeRow.className = 'structured-admin-editor__row structured-admin-editor__row--split';
          timeRow.append(buildInput('Open time', rowValue.open_time, function (nextValue) {
            state.value[rowIndex].open_time = nextValue;
            syncTextarea();
          }, { placeholder: '11:00 AM', timeFormat: '12hr', onInput: refreshHoursPreview }));
          timeRow.append(buildInput('Close time', rowValue.close_time, function (nextValue) {
            state.value[rowIndex].close_time = nextValue;
            syncTextarea();
          }, { placeholder: '10:00 PM', timeFormat: '12hr', onInput: refreshHoursPreview }));
          card.append(timeRow);
        }
        card.append(buildButton('Remove hours row', 'structured-admin-editor__button--danger', function () {
          state.value.splice(rowIndex, 1);
          syncTextarea();
          renderHours();
        }));
        editorRoot.append(card);
      });

      if (state.value.length) {
        const previewSection = document.createElement('section');
        previewSection.className = 'structured-admin-editor__hours-preview';
        const previewHeader = document.createElement('div');
        previewHeader.className = 'structured-admin-editor__hours-preview-header';
        const previewHeading = document.createElement('h4');
        previewHeading.className = 'structured-admin-editor__step-heading';
        previewHeading.textContent = 'Hours customers will see';
        const previewCaption = document.createElement('span');
        previewCaption.className = 'structured-admin-editor__help';
        previewCaption.textContent = 'Customer preview';
        previewHeader.append(previewHeading, previewCaption);
        const preview = document.createElement('div');
        preview.className = 'structured-admin-editor__hours-preview-list';
        previewRows = preview;
        refreshHoursPreview();
        previewSection.append(previewHeader, preview);
        editorRoot.append(previewSection);
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
    document.querySelectorAll('textarea[data-image-gallery-editor]').forEach(hydrateImportedImageGallery);
    document.querySelectorAll('textarea[data-structured-editor]').forEach(hydrateStructuredEditor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStructuredEditors);
  } else {
    initializeStructuredEditors();
  }
})();
