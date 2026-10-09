import { formatDealDescription, parseDealMenuItem, serializeDealMenuItems } from '../dealDescription';

const appetizerEntries = [
  'POTATO SKINS $12 (Six potato wedges topped with melted cheese, bacon, and sauteed onions; served with salsa or ranch dressing.)',
  'TAQUITOS $8 (Six mini crispy beef or chicken taquitos, served with sour cream and guacamole.)',
  'CHICKEN WINGS $8 (Six chicken wings served with a side of ranch dressing.)',
  'MINI BEAN & CHEESE CHIMIS $12 (Six mini bean and cheese chimi burritos, topped with guacamole and sour cream.)',
  'SHRIMP COCKTAIL $17 (Shrimp cocktail with pico de gallo and spices.)',
];

describe('automatic menu organization', () => {
  it('keeps structured weekday offers in order and keeps their prices inline, not in a third column', () => {
    const items = [
      { name: 'Platter', price: '$12', detail: '' },
      { name: 'Fries', price: '$5', detail: '' },
      { name: 'Tani combo', price: '$15.98', detail: 'Fish tacos', weekdays: [1] },
      { name: 'Karen combo', price: '$9.98', detail: 'Salmon and shrimp', weekdays: [2] },
      { name: 'Weekend combo', price: '$20', detail: '', weekdays: [6, 5] },
      { name: 'Martini', price: '$10', detail: '' },
      { name: 'Beer', price: '$6', detail: '' },
    ];
    const rows = formatDealDescription('', items);
    expect(rows.map((row) => row.text)).toEqual([
      'Fries $5', 'Platter $12', 'Tani combo $15.98 (Fish tacos)',
      'Karen combo $9.98 (Salmon and shrimp)', 'Weekend combo $20', 'Beer $6', 'Martini $10',
    ]);
    expect(rows.slice(2, 5)).toEqual([
      { label: 'Tuesday', text: 'Tani combo $15.98 (Fish tacos)' },
      { label: 'Wednesday', text: 'Karen combo $9.98 (Salmon and shrimp)' },
      { label: 'Sat, Sun', text: 'Weekend combo $20' },
    ]);
    expect(serializeDealMenuItems(items).split('\n').slice(2, 5)).toEqual([
      'Tuesday - Tani combo $15.98 (Fish tacos)',
      'Wednesday - Karen combo $9.98 (Salmon and shrimp)', 'Sat, Sun - Weekend combo $20',
    ]);
    expect(items[0].name).toBe('Platter');
    expect(items[4].weekdays).toEqual([6, 5]);
  });

  it('keeps a separately entered note price inline when the note already has a weekday label', () => {
    expect(formatDealDescription('Tuesday - Taco combo', [], '$15')).toEqual([{ label: 'Tuesday', text: 'Taco combo $15' }]);
    expect(formatDealDescription('Tuesday - Taco combo $15', [], '$15')).toEqual([{ label: 'Tuesday', text: 'Taco combo $15' }]);
  });

  it('aligns a separately entered description price without parsing a trailing space', () => {
    expect(formatDealDescription('Sample of the description of the deal', [], '$2')).toEqual([
      { label: null, text: 'Sample of the description of the deal', descriptionPrice: '$2' },
    ]);
  });

  it('does not display a repeated description price twice when it is also at the end of the note', () => {
    expect(formatDealDescription('Sample of the description of the deal $2', [], '$2')).toEqual([
      { label: null, text: 'Sample of the description of the deal', descriptionPrice: '$2' },
    ]);
  });

  it('formats repeatable menu fields with aligned prices and keeps general notes and details intact', () => {
    const items = [
      { name: 'Frozen cocktail', price: '$8', detail: 'Blended with fresh lime' },
      { name: 'Draft beer', price: '$2 Off', detail: 'Pint' },
      { name: 'Well wine', price: '$5', detail: 'House red or white' },
    ];
    const rows = formatDealDescription('General happy-hour note.', items);

    expect(rows.map((row) => row.text)).toEqual([
      'General happy-hour note.',
      'Well wine $5 (House red or white)',
      'Draft beer $2 Off (Pint)',
      'Frozen cocktail $8 (Blended with fresh lime)',
    ]);
    expect(rows.slice(1).map((row) => row.menuItem?.name)).toEqual(['Well wine', 'Draft beer', 'Frozen cocktail']);
    expect(serializeDealMenuItems(items)).toBe([
      'Frozen cocktail $8 (Blended with fresh lime)',
      'Draft beer $2 Off (Pint)',
      'Well wine $5 (House red or white)',
    ].join('\n'));
  });

  it('extracts names, explicit prices, and complete nested descriptions without rewriting them', () => {
    expect(parseDealMenuItem('Chips & Dips $4 (Chips & Housemade Guacamole + Salsa)')).toEqual({
      name: 'Chips & Dips', price: '$4', detail: '(Chips & Housemade Guacamole + Salsa)', kind: 'cost', sortPrice: 400,
    });
    expect(parseDealMenuItem('NACHOS $12.50 (Fresh chips (served with salsa); add chicken for $3.)')).toEqual({
      name: 'NACHOS', price: '$12.50', detail: '(Fresh chips (served with salsa); add chicken for $3.)', kind: 'cost', sortPrice: 1250,
    });
    expect(parseDealMenuItem('Party platter $1,000')).toMatchObject({ price: '$1,000', sortPrice: 100000 });
    expect(parseDealMenuItem('Tacos $5 each')).toMatchObject({ price: '$5 each', sortPrice: 500 });
  });

  it.each(['\n', ' || ', ' '])('organizes described menu entries separated by %j, cheapest first with stable ties', (separator) => {
    const source = appetizerEntries.join(separator);
    const rows = formatDealDescription(source);
    expect(rows.map((row) => row.text)).toEqual([
      appetizerEntries[1], appetizerEntries[2], appetizerEntries[0], appetizerEntries[3], appetizerEntries[4],
    ]);
    expect(rows.map((row) => row.menuItem?.price)).toEqual(['$8', '$8', '$12', '$12', '$17']);
    expect(rows.every((row) => row.menuItem?.detail?.startsWith('('))).toBe(true);
    expect(source).toBe(appetizerEntries.join(separator));
  });

  it('keeps sentence punctuation with the description when identifying inline entries', () => {
    const rows = formatDealDescription('Wings $12 (Six wings). Chips $4 (Served with salsa)!');
    expect(rows.map((row) => row.text)).toEqual(['Chips $4 (Served with salsa)!', 'Wings $12 (Six wings).']);
    expect(rows.map((row) => row.menuItem?.detail)).toEqual(['(Served with salsa)!', '(Six wings).']);
  });

  it.each([', ', '; ', ' • '])('recognizes clear inline price-list punctuation %j without splitting options inside descriptions', (separator) => {
    const rows = formatDealDescription(['Wine $8', 'Beers $5', 'Cocktails $12'].join(separator));
    expect(rows.map((row) => row.menuItem?.name)).toEqual(['Beers', 'Wine', 'Cocktails']);
    const withThousands = formatDealDescription('Party platter $1,000, Chips $4');
    expect(withThousands.map((row) => row.menuItem?.price)).toEqual(['$4', '$1,000']);
  });

  it('sorts actual Larsen-style prices without treating discount amounts as item costs', () => {
    const source = [
      'House Wine $8', 'Well Drinks $8', 'Well Martinis $11', 'Select Bottled Beers $5',
      'All Draft Beers $1 Off', 'All Signature Cocktails $2 Off', 'Red or White Sangria $9',
      'Moscow Mule $9', 'Classic or Passionfruit Margarita $10', 'Classic House Old Fashioned $11',
    ];
    const rows = formatDealDescription(source.join('\n'));
    expect(rows.filter((row) => row.menuItem?.kind === 'cost').map((row) => row.menuItem?.sortPrice)).toEqual([
      500, 800, 800, 900, 900, 1000, 1100, 1100,
    ]);
    expect(rows[4].text).toBe(source[4]);
    expect(rows[5].text).toBe(source[5]);
    expect(rows.filter((row) => row.menuItem?.kind === 'discount').every((row) => row.menuItem?.sortPrice === null)).toBe(true);
    expect(rows.map((row) => row.text).sort()).toEqual([...source].sort());
  });

  it('does not move items across notes, categories, ranges, add-on context, or written weekday boundaries', () => {
    const source = 'FOOD\nPlatter $12\nFries $5\nTerms: dine in only.\nDRINKS\nMartini $10\nBeer $6\nTuesday - Taco combo $15\nWednesday - Burrito combo $11\nFlight $8 - $12\nTacos $9\nChips $4\nAdd chicken $3\nNachos $12\nSalsa $2';
    expect(formatDealDescription(source).map((row) => row.label ? `${row.label} - ${row.text}` : row.text)).toEqual([
      'FOOD', 'Fries $5', 'Platter $12', 'Terms: dine in only.', 'DRINKS', 'Beer $6', 'Martini $10',
      'Tuesday - Taco combo $15', 'Wednesday - Burrito combo $11', 'Flight $8 - $12', 'Chips $4', 'Tacos $9',
      'Add chicken $3', 'Salsa $2', 'Nachos $12',
    ]);
    expect(parseDealMenuItem('Flight $8 - $12')).toMatchObject({ price: '$8 - $12', kind: 'other', sortPrice: null });
    expect(parseDealMenuItem('Add chicken $3')).toMatchObject({ kind: 'other', sortPrice: null });
  });

  it('keeps explicitly day/time-limited items in place without inventing weekday labels', () => {
    const rows = formatDealDescription('Tuesday Tacos $8\nWednesday Wings $5\nCocktails $9 (After 9 PM)\nBurgers $12 (Friday only)');
    expect(rows.map((row) => row.menuItem?.name)).toEqual(['Tuesday Tacos', 'Wednesday Wings', 'Cocktails', 'Burgers']);
    expect(rows.every((row) => row.label === null && row.menuItem?.kind === 'other' && row.menuItem?.sortPrice === null)).toBe(true);
  });

  it.each([
    'Come by on Friday for $5 drinks.',
    'Terms: drink is included for $1.00',
    'Cocktails $5 or $7',
    'Tacos $8 (Served with salsa',
    'Ask staff / see menu for details.',
    'Wings $8 (Served with ranch). Ask staff about today\'s specials.',
  ])('keeps ambiguous prose intact: %s', (source) => {
    expect(parseDealMenuItem(source)).toBeNull();
    expect(formatDealDescription(source)).toEqual([{ label: null, text: source }]);
  });
});
