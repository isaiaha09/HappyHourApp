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
	*multi_location_business('Cronies Sports Grill', [
		{
			'city': 'ventura',
			'venue_type': 'bar',
			'source_url': 'https://www.cronies.com/locations',
			'source_documents': [
				{
					'url': 'https://www.cronies.com/locations',
					'roles': ['identity', 'images', 'hours'],
				},
				{
					'text': 'Happy Hour weekdays from 3:00pm to 6:00pm.',
					'roles': ['deals'],
				},
			],
			'address_line_1': '2855 Johnson Dr',
			'phone_number': '(805) 650-6026',
			'postal_code': '93003',
			'latitude': 34.2477,
			'longitude': -119.19652,
			'geocode_query': 'Cronies Sports Grill, Ventura, CA',
			'website_url': 'https://www.cronies.com/',
		},
		{
			'name': 'Cronies Sports Grill Camarillo',
			'city': 'camarillo',
			'venue_type': 'bar',
			'source_url': 'https://www.cronies.com/locations',
			'source_documents': [
				{
					'url': 'https://www.cronies.com/locations',
					'roles': ['identity', 'images', 'hours'],
				},
				{
					'text': 'Happy Hour weekdays from 3:00pm to 6:00pm.',
					'roles': ['deals'],
				},
			],
			'address_line_1': '370 N Lantana St',
			'phone_number': '(805) 482-5900',
			'postal_code': '93010',
			'latitude': 34.21961,
			'longitude': -119.05442,
			'geocode_query': 'Cronies Sports Grill, Camarillo, CA',
			'website_url': 'https://www.cronies.com/',
		},
	]),
	{
		'name': "Snapper Jack's Taco Shack",
		'enabled': True,
		'city': 'ventura',
		'venue_type': 'fast_food',
		'source_url': 'https://www.snapperjackstacoshack.com/',
		'source_documents': [
			{
				'url': 'https://www.snapperjackstacoshack.com/',
				'roles': ['identity', 'deals', 'images'],
			},
		],
		'address_line_1': '533 E. Main Street',
		'postal_code': '93001',
		'geocode_query': "Snapper Jack's Taco Shack, Ventura, CA",
		'website_url': 'https://www.snapperjackstacoshack.com/',
	},
	{
		'name': "Yolanda's Mexican Cafe",
		'enabled': True,
		'city': 'oxnard',
		'venue_type': 'restaurant',
		'source_url': 'https://www.yolandasmexicancafe.com/',
		'website_url': 'https://www.yolandasmexicancafe.com/',
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
		'name': 'Aloha Steakhouse',
		'city': 'ventura',
		'venue_type': 'restaurant',
		'source_url': 'https://www.alohasteakhouse.com/',
		'source_documents': [
			{
				'url': 'https://www.alohasteakhouse.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy Hour Monday - Friday 3:00pm - 6:00pm.',
				'roles': ['deals'],
			},
		],
		'address_line_1': '364 S California St',
		'phone_number': '(805) 652-1799',
		'postal_code': '93001',
		'geocode_query': 'Aloha Steakhouse, Ventura, CA',
		'website_url': 'https://www.alohasteakhouse.com/',
	},
	{
		'name': 'Bright Spark Brewing',
		'city': 'ventura',
		'venue_type': 'bar',
		'source_url': 'https://www.brightsparkbrewing.com/',
		'source_documents': [
			{
				'url': 'https://www.brightsparkbrewing.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': "Little Sparks Night every Tuesday: 50% off a kid's meal with the purchase of an adult meal.",
				'roles': ['deals'],
			},
		],
		'address_line_1': '4561 Market Street',
		'phone_number': '(805) 322-8884',
		'postal_code': '93003',
		'geocode_query': 'Bright Spark Brewing, Ventura, CA',
		'website_url': 'https://www.brightsparkbrewing.com/',
	},
	{
		'name': 'Rumfish y Vino',
		'city': 'ventura',
		'venue_type': 'restaurant',
		'source_url': 'http://www.rumfishyvinoventura.com/',
		'source_documents': [
			{
				'url': 'http://www.rumfishyvinoventura.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy Hour Monday - Friday 3:00pm to 6:00pm. Saturday 3:00pm to 5:00pm. Sunday 2:00pm to 5:00pm.',
				'roles': ['deals'],
			},
			{
				'text': 'Hours of Operation Monday - Saturday 11:30am to Close. Sunday 11:00am to Close. Lunch Monday - Saturday 11:30am to 3:00pm. Brunch Sunday 11:00am to 2:00pm. Dinner Monday - Sunday Beginning at 3:00pm.',
				'roles': ['hours'],
			},
		],
		'address_line_1': '34 N Palm St',
		'phone_number': '(805) 667-9288',
		'postal_code': '93001',
		'geocode_query': 'Rumfish y Vino, Ventura, CA',
		'website_url': 'http://www.rumfishyvinoventura.com/',
	},
	{
		'name': 'Rocks & Drams',
		'city': 'ventura',
		'venue_type': 'bar',
		'source_url': 'https://rocksanddrams.com/',
		'source_documents': [
			{
				'url': 'https://rocksanddrams.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy hour weekdays from 4-6pm, Saturdays from 12-2pm and Sunday all day with $2 off all menu prices on food and drinks.',
				'roles': ['deals'],
			},
			{
				'text': 'Business Hours Sunday 12:00 PM - 8:00 PM. Monday Closed. Tuesday Closed. Wednesday 4:00 PM - 10:00 PM. Thursday 4:00 PM - 10:00 PM. Friday 4:00 PM - 11:59 PM. Saturday 12:00 PM - 11:59 PM.',
				'roles': ['hours'],
			},
		],
		'address_line_1': '14 S California St',
		'phone_number': '(805) 667-8585',
		'postal_code': '93001',
		'geocode_query': 'Rocks & Drams, Ventura, CA',
		'website_url': 'https://rocksanddrams.com/',
	},
	{
		'name': 'Winchesters Grill & Saloon',
		'city': 'ventura',
		'venue_type': 'bar',
		'source_url': 'https://www.winchestersgrill.com/',
		'source_documents': [
			{
				'url': 'https://www.winchestersgrill.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Happy Hour food and drink specials from 3:00-6:00 Tuesdays thru Fridays.',
				'roles': ['deals'],
			},
			{
				'text': 'Hours of Operation Tuesday-Sunday 11:00 AM-11:00 PM. Closed Mondays.',
				'roles': ['hours'],
			},
		],
		'address_line_1': 'E Main St',
		'phone_number': '(805) 628-3365',
		'geocode_query': 'Winchesters Grill & Saloon, Ventura, CA',
		'website_url': 'https://www.winchestersgrill.com/',
	},
	{
		'name': 'Old Town Cafe',
		'city': 'camarillo',
		'venue_type': 'cafe',
		'source_url': 'https://www.oldtowncafecamarillo.com/',
		'source_documents': [
			{
				'url': 'https://www.myoldtowncafe.com/',
				'roles': ['identity', 'images'],
			},
			{
				'text': 'Daily Special breakfast and lunch favorites served every day.',
				'roles': ['deals'],
			},
		],
		'address_line_1': '2050 E Ventura Blvd',
		'phone_number': '(805) 484-5500',
		'postal_code': '93010',
		'geocode_query': 'Old Town Cafe, Camarillo, CA',
		'website_url': 'https://www.myoldtowncafe.com/',
	},
]