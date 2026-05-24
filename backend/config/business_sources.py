from django.utils.text import slugify


def multi_location_business(profile_name, locations):
	profile_slug = slugify(profile_name)
	pages = []

	for location in locations:
		page = dict(location)
		page.setdefault('name', profile_name)
		page.setdefault('profile_name', profile_name)
		page.setdefault('profile_slug', profile_slug)
		pages.append(page)

	return pages


BUSINESS_SOURCE_PAGES = [
	*multi_location_business('Lure Fish House', [
		{
			'city': 'ventura',
			'venue_type': 'restaurant',
			'source_url': 'https://www.lurefishhouse.com/location/lure-fish-house-ventura/',
			'source_documents': [
				{
					'url': 'https://www.lurefishhouse.com/location/lure-fish-house-ventura/',
					'roles': ['identity', 'deals', 'images'],
				},
				{
					'text': 'Sunday - Thursday: 11:30am - 9:00pm. Friday - Saturday: 11:30am - 10:00pm.',
					'roles': ['hours'],
				},
			],
			'deal_selectors': ['#happy-hour'],
			'geocode_query': 'Lure Fish House, Ventura, CA',
			'website_url': 'https://www.lurefishhouse.com/location/lure-fish-house-ventura/',
		},
		{
			'name': 'Lure Fish House Camarillo',
			'city': 'camarillo',
			'venue_type': 'restaurant',
			'source_url': 'https://www.lurefishhouse.com/location/lure-fish-house-camarillo/',
			'source_documents': [
				{
					'url': 'https://www.lurefishhouse.com/location/lure-fish-house-camarillo/',
					'roles': ['identity', 'deals', 'images'],
				},
				{
					'text': 'Sunday - Thursday: 11:30am - 9:00pm. Friday - Saturday: 11:30am - 10:00pm.',
					'roles': ['hours'],
				},
			],
			'deal_selectors': ['#happy-hour'],
			'geocode_query': 'Lure Fish House, Camarillo, CA',
			'website_url': 'https://www.lurefishhouse.com/location/lure-fish-house-camarillo/',
		},
	]),
	*multi_location_business("Finney's Crafthouse", [
		{
			'city': 'ventura',
			'venue_type': 'bar',
			'source_url': 'https://www.finneyscrafthouse.com/ventura/',
			'source_documents': [
				{
					'url': 'https://www.finneyscrafthouse.com/ventura/',
					'roles': ['identity', 'images'],
				},
				{
					'url': 'https://www.finneyscrafthouse.com/wp-content/uploads/2026/04/NEW_HAPPY_HOUR_DRINKS_MENU_1_26.pdf',
					'roles': ['deals'],
					'format': 'pdf',
				},
				{
					'text': 'Sunday - Wednesday: 11:00am - 9:00pm. Thursday - Saturday: 11:00am - 10:00pm.',
					'roles': ['hours'],
				},
			],
			'address_line_1': '494 E. Main Street',
			'phone_number': '(805) 628-3312',
			'postal_code': '93001',
			'geocode_query': 'Finneys Ventura, CA',
			'website_url': 'https://www.finneyscrafthouse.com/ventura/',
		},
		{
			'name': "Finney's Crafthouse Camarillo",
			'city': 'camarillo',
			'venue_type': 'bar',
			'source_url': 'https://www.finneyscrafthouse.com/camarillo/',
			'source_documents': [
				{
					'url': 'https://www.finneyscrafthouse.com/camarillo/',
					'roles': ['identity', 'images'],
				},
				{
					'url': 'https://www.finneyscrafthouse.com/wp-content/uploads/2026/04/NEW_HAPPY_HOUR_DRINKS_MENU_1_26.pdf',
					'roles': ['deals'],
					'format': 'pdf',
				},
				{
					'text': 'Sunday - Thursday: 11:00am - 9:00pm. Friday - Saturday: 11:00am - 10:00pm.',
					'roles': ['hours'],
				},
			],
			'address_line_1': '580 Ventura Blvd',
			'phone_number': '(805) 702-0010',
			'postal_code': '93010',
			'geocode_query': 'Finneys Camarillo, CA',
			'website_url': 'https://www.finneyscrafthouse.com/camarillo/',
		},
	]),
	{
		'name': "Snapper Jack's Taco Shack",
		'enabled': False,
		'city': 'ventura',
		'venue_type': 'fast_food',
		'source_url': 'https://snapperjackstacoshack.com/',
		'source_documents': [
			{
				'url': 'https://snapperjackstacoshack.com/',
				'roles': ['identity', 'deals', 'images'],
			},
		],
		'address_line_1': '533 E. Main Street',
		'postal_code': '93001',
		'geocode_query': "Snapper Jack's Taco Shack, Ventura, CA",
		'website_url': 'https://snapperjackstacoshack.com/',
	},
	{
		'name': "Yolanda's Mexican Cafe",
		'enabled': False,
		'city': 'oxnard',
		'venue_type': 'restaurant',
		'source_url': 'https://www.yolandas.com/',
		'website_url': 'https://www.yolandas.com/',
	},
	{
		'name': 'Lazy Dog Restaurant & Bar',
		'city': 'oxnard',
		'venue_type': 'bar',
		'source_url': 'https://www.lazydogrestaurants.com/pages/locations',
		'source_documents': [
			{
				'url': 'https://www.lazydogrestaurants.com/pages/locations',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy Hour Mon-Fri: 3pm-6pm. Late Night Sun-Thu: 9pm-11pm.',
				'roles': ['deals'],
			},
			{
				'text': 'Monday - Thursday: 11:00am - 11:00pm. Friday: 11:00am - 12:00am. Saturday: 10:00am - 12:00am. Sunday: 10:00am - 11:00pm.',
				'roles': ['hours'],
			},
		],
		'address_line_1': '598 Town Center Dr',
		'phone_number': '(805) 351-4888',
		'postal_code': '93036',
		'geocode_query': 'Lazy Dog Oxnard, CA',
		'website_url': 'https://www.lazydogrestaurants.com/pages/locations',
	},
	{
		'name': 'The Collection at RiverPark',
		'city': 'oxnard',
		'venue_type': 'attraction',
		'source_url': 'https://www.thecollectionrp.com/',
		'source_documents': [
			{
				'url': 'https://www.thecollectionrp.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Monday - Saturday: 10:00am - 9:00pm. Sunday: 11:00am - 7:00pm.',
				'roles': ['hours'],
			},
		],
		'address_line_1': '2751 Park View Court',
		'postal_code': '93036',
		'geocode_query': 'The Collection at RiverPark, Oxnard, CA',
		'website_url': 'https://www.thecollectionrp.com/',
	},
	{
		'name': 'Yard House',
		'city': 'oxnard',
		'venue_type': 'bar',
		'source_url': 'https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
		'source_documents': [
			{
				'url': 'https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy Hour Monday - Friday 3:00pm - 6:00pm. 1/2 Off Select Apps & All Pizzas. $2 Off Beer, Wine, Spirits & Cocktails. Dine-in only. Happy hour offerings, days and times vary by location.',
				'roles': ['deals'],
			},
			{
				'text': 'Late Night Happy Hour Sunday - Wednesday 10:00pm - Close. $2 Off All Draft Beer, Wine, Spirits & Cocktails. $3 Off 9oz Wine. $4 Off Half Yards. Full menu available til late. Dine-in only.',
				'roles': ['deals'],
			},
			{
				'text': 'Sunday - Thursday: 11:00am - 10:30pm. Friday - Saturday: 11:00am - 11:30pm.',
				'roles': ['hours'],
			},
		],
		'address_line_1': '501 Collection Blvd Ste # 4130',
		'phone_number': '(805) 981-8707',
		'postal_code': '93036',
		'geocode_query': 'Yard House, Oxnard, CA',
		'website_url': 'https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
	},
	{
		'name': 'Institution Ale Co.',
		'city': 'camarillo',
		'venue_type': 'bar',
		'source_url': 'https://www.institutionales.com/',
		'source_documents': [
			{
				'url': 'https://www.institutionales.com/',
				'roles': ['identity', 'images'],
			},
			{
				'url': 'https://www.institutionales.com/happy-hour',
				'roles': ['deals', 'images'],
			},
			{
				'url': 'https://www.institutionales.com/hours',
				'roles': ['hours'],
			},
		],
		'address_line_1': '3841 Mission Oaks Boulevard',
		'phone_number': '(805) 482-3777',
		'postal_code': '93011',
		'geocode_query': 'Institution Ale Co., Camarillo, CA',
		'website_url': 'https://www.institutionales.com/',
	},
	{
		'name': 'Old Town Cafe',
		'enabled': False,
		'city': 'camarillo',
		'venue_type': 'cafe',
		'source_url': 'https://www.oldtowncafecamarillo.com/',
		'website_url': 'https://www.oldtowncafecamarillo.com/',
	},
]