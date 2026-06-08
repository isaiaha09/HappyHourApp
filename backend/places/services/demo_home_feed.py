from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from places.models import BusinessClaim, BusinessMembership, BusinessPost, City, ListingSnapshot, SponsoredCampaign, VenueType


DEMO_HOME_FEED_SOURCE_NAME = 'demo_home_feed_seed'


def get_demo_home_feed_business_specs():
    return [
        {
            'username': 'demo_feed_sunset_taco_house',
            'email': 'demo.sunset.taco.house@example.com',
            'snapshot': {
                'listing_slug': 'sunset-taco-house-ventura',
                'name': 'Sunset Taco House',
                'city': City.VENTURA,
                'venue_type': VenueType.RESTAURANT,
                'address_line_1': '128 Harbor Blvd',
                'website_url': 'https://example.com/sunset-taco-house',
            },
            'posts': [
                ('special', 'Sunset Hour Street Taco Trio', 'Three adobada tacos and a house agua fresca for $11 from 4-6pm.', 'Our patio happy-hour bundle is built for after-work drop-ins with fast pickup and walk-up ordering.', 'https://picsum.photos/seed/ddz-sunset-taco-special/1200/800', 'View Special', 'https://example.com/sunset-taco-house/specials', 1),
                ('announcement', 'Now Serving the Late Crowd', 'Kitchen hours now run until 11:30pm on Fridays and Saturdays.', 'We extended service after repeated customer requests for a true late-night taco stop near downtown Ventura.', 'https://picsum.photos/seed/ddz-sunset-taco-announce/1200/800', 'Read Update', 'https://example.com/sunset-taco-house/news', 2),
                ('event', 'Mariachi Patio Night', 'Live mariachi returns this Thursday at 7pm.', 'We are turning the front patio into a neighborhood set with family-style snack platters and cold horchata.', 'https://picsum.photos/seed/ddz-sunset-taco-event/1200/800', 'See Event', 'https://example.com/sunset-taco-house/events', 3),
                ('blog', 'Why Our Tortillas Changed This Season', 'A short kitchen note on the local masa blend we switched to for summer service.', 'We wanted a more realistic editorial card mixed into the feed instead of only deals and event promos.', 'https://picsum.photos/seed/ddz-sunset-taco-blog/1200/800', 'Read Story', 'https://example.com/sunset-taco-house/blog', 4),
            ],
            'sponsored': [0, 2],
        },
        {
            'username': 'demo_feed_cafe_sonoro',
            'email': 'demo.cafe.sonoro@example.com',
            'snapshot': {
                'listing_slug': 'cafe-sonoro-oxnard',
                'name': 'Cafe Sonoro',
                'city': City.OXNARD,
                'venue_type': VenueType.CAFE,
                'address_line_1': '412 S A St',
                'website_url': 'https://example.com/cafe-sonoro',
            },
            'posts': [
                ('blog', 'Why We Roast a Little Lighter for Summer', 'A behind-the-bar look at the fruit-forward espresso profile we are using this month.', 'Our bar team wanted a brighter iced latte base that still cuts through oat milk and house-made syrups.', 'https://picsum.photos/seed/ddz-cafe-sonoro-blog/1200/800', 'Read Story', 'https://example.com/cafe-sonoro/blog', 1),
                ('special', 'Iced Latte + Pan Dulce Combo', 'Any iced latte paired with a guava cream pastry for $9 until 2pm.', 'This is our busiest grab-and-go pairing during the morning rush for downtown office traffic.', 'https://picsum.photos/seed/ddz-cafe-sonoro-special/1200/800', 'Grab the Combo', 'https://example.com/cafe-sonoro/menu', 2),
                ('announcement', 'Mobile Order Shelf Added', 'Pickup is faster now with a dedicated mobile-order shelf near the front counter.', 'We finally separated in-store and mobile pickup flow so the line does not bottleneck near the pastry case.', 'https://picsum.photos/seed/ddz-cafe-sonoro-announce/1200/800', 'See Details', 'https://example.com/cafe-sonoro/updates', 3),
                ('event', 'Sunrise Cupping Session', 'Join our staff tasting flight this Sunday at 8:30am.', 'This gives the feed a lighter weekend event card for a coffee-first audience in Oxnard.', 'https://picsum.photos/seed/ddz-cafe-sonoro-event/1200/800', 'Reserve Spot', 'https://example.com/cafe-sonoro/events', 5),
            ],
            'sponsored': [1],
        },
        {
            'username': 'demo_feed_moonlight_market',
            'email': 'demo.moonlight.market@example.com',
            'snapshot': {
                'listing_slug': 'moonlight-night-market-camarillo',
                'name': 'Moonlight Night Market',
                'city': City.CAMARILLO,
                'venue_type': VenueType.SHOP,
                'address_line_1': '67 Village Sq',
                'website_url': 'https://example.com/moonlight-night-market',
            },
            'posts': [
                ('event', 'After Dark Maker Pop-Up', 'Fifteen local makers are taking over the courtyard this Saturday from 6-10pm.', 'Expect candles, ceramics, street food booths, and a live vinyl set that ramps up once the sun goes down.', 'https://picsum.photos/seed/ddz-moonlight-event/1200/800', 'View Lineup', 'https://example.com/moonlight-night-market/events', 1),
                ('announcement', 'Parking Validation Expanded', 'Garage validation now covers the full evening market window.', 'That change should make it easier for families and group shoppers to stay longer without worrying about meter timing.', 'https://picsum.photos/seed/ddz-moonlight-announce/1200/800', 'See Parking Info', 'https://example.com/moonlight-night-market/info', 2),
                ('blog', 'Meet the Ceramic Artists Joining This Month', 'A quick spotlight on three returning makers and the glaze styles they are bringing back.', 'We wanted the feed to have a few editorial-style cards too, not just deals and alerts.', 'https://picsum.photos/seed/ddz-moonlight-blog/1200/800', 'Read Feature', 'https://example.com/moonlight-night-market/blog', 3),
                ('special', 'Vendor Passport Giveaway', 'Visit five booths and enter to win a $75 market card.', 'This plays like a special even though it is more of a marketplace-wide engagement promo.', 'https://picsum.photos/seed/ddz-moonlight-special/1200/800', 'Get the Passport', 'https://example.com/moonlight-night-market/passport', 5),
            ],
            'sponsored': [0],
        },
        {
            'username': 'demo_feed_smokestack_social',
            'email': 'demo.smokestack.social@example.com',
            'snapshot': {
                'listing_slug': 'smokestack-social-ventura',
                'name': 'Smokestack Social',
                'city': City.VENTURA,
                'venue_type': VenueType.BAR,
                'address_line_1': '901 Thompson Blvd',
                'website_url': 'https://example.com/smokestack-social',
            },
            'posts': [
                ('special', 'Whiskey Flight Wednesdays', 'Choose any three house-favorite pours for $18 every Wednesday night.', 'The card is meant to feel like a premium but still native-looking promotion inside the feed.', 'https://picsum.photos/seed/ddz-smokestack-special/1200/800', 'See Flights', 'https://example.com/smokestack-social/flights', 1),
                ('event', 'Rooftop DJ Set', 'Saturday at 8pm with vinyl-heavy soul and funk all night.', 'We are using this as a stronger event example with nightlife copy and an evening visual.', 'https://picsum.photos/seed/ddz-smokestack-event/1200/800', 'Reserve Spot', 'https://example.com/smokestack-social/events', 2),
                ('announcement', 'Expanded Zero-Proof Menu', 'Four new spirit-free cocktails are now on the main menu.', 'This announcement gives you a more everyday utility card between louder specials and events.', 'https://picsum.photos/seed/ddz-smokestack-announce/1200/800', 'View Menu', 'https://example.com/smokestack-social/menu', 3),
                ('blog', 'How Our Bartenders Build the Smoke Note', 'A quick breakdown of the rinse, garnish, and glassware choices behind our signature pour.', 'This rounds out the bar content mix with one story-driven post instead of another promo tile.', 'https://picsum.photos/seed/ddz-smokestack-blog/1200/800', 'Read Story', 'https://example.com/smokestack-social/blog', 4),
            ],
            'sponsored': [0, 1],
        },
        {
            'username': 'demo_feed_rolling_slice',
            'email': 'demo.rolling.slice@example.com',
            'snapshot': {
                'listing_slug': 'rolling-slice-805',
                'name': 'Rolling Slice Pizza Truck',
                'city': City.OXNARD,
                'venue_type': VenueType.MOBILE,
                'address_line_1': 'Multiple 805 Stops',
                'website_url': 'https://example.com/rolling-slice',
            },
            'posts': [
                ('special', 'Two Slice Lunch Window', 'Pepperoni or margherita with a soda for $10 at weekday lunch stops.', 'This one represents an on-the-move business using the feed for recurring route-driven offers.', 'https://picsum.photos/seed/ddz-rolling-slice-special/1200/800', "Find Today's Stop", 'https://example.com/rolling-slice/route', 1),
                ('announcement', 'New Thursday Harbor Route', 'We added a Ventura Harbor stop from 12-3pm every Thursday.', 'This is a good example of operational updates that are genuinely useful in a local marketplace feed.', 'https://picsum.photos/seed/ddz-rolling-slice-announce/1200/800', 'See Route', 'https://example.com/rolling-slice/route', 2),
                ('blog', 'How We Built the Crispiest Truck Oven Crust', 'A short founder note on the oven retrofit that changed our bake quality.', 'This gives you another editorial card from a business that is not a fixed-location venue.', 'https://picsum.photos/seed/ddz-rolling-slice-blog/1200/800', 'Read Post', 'https://example.com/rolling-slice/story', 3),
                ('event', 'Friday Schoolyard Stop', 'We are parking next to the Oxnard youth concert series this Friday from 5-8pm.', 'A mobile route-based event example helps the feed feel closer to how a local app would actually be used.', 'https://picsum.photos/seed/ddz-rolling-slice-event/1200/800', 'See Stop', 'https://example.com/rolling-slice/events', 4),
            ],
            'sponsored': [0],
        },
        {
            'username': 'demo_feed_boardwalk_burgers',
            'email': 'demo.boardwalk.burgers@example.com',
            'snapshot': {
                'listing_slug': 'boardwalk-burgers-ventura',
                'name': 'Boardwalk Burgers',
                'city': City.VENTURA,
                'venue_type': VenueType.FAST_FOOD,
                'address_line_1': '54 Seaward Ave',
                'website_url': 'https://example.com/boardwalk-burgers',
            },
            'posts': [
                ('special', 'Double Stack + Fries Window', 'Grab our top-selling combo for $12 from 2-5pm daily.', 'A high-frequency quick-service offer gives the feed a more everyday lunch card.', 'https://picsum.photos/seed/ddz-boardwalk-special/1200/800', 'Order Now', 'https://example.com/boardwalk-burgers/order', 1),
                ('announcement', 'Curbside Pickup Spots Added', 'We painted two short-term curbside stalls right out front.', 'That small operational change is exactly the kind of practical feed update customers actually use.', 'https://picsum.photos/seed/ddz-boardwalk-announce/1200/800', 'See Pickup Info', 'https://example.com/boardwalk-burgers/info', 2),
                ('event', 'Beach Cleanup Meal Deal', 'Show your cleanup wristband Saturday and get a free drink with any combo.', 'This mixes community event participation into a fast-casual feed card without feeling off-brand.', 'https://picsum.photos/seed/ddz-boardwalk-event/1200/800', 'View Deal', 'https://example.com/boardwalk-burgers/events', 5),
            ],
            'sponsored': [0],
        },
        {
            'username': 'demo_feed_pacific_pourhouse',
            'email': 'demo.pacific.pourhouse@example.com',
            'snapshot': {
                'listing_slug': 'pacific-pourhouse-camarillo',
                'name': 'Pacific Pourhouse',
                'city': City.CAMARILLO,
                'venue_type': VenueType.BAR,
                'address_line_1': '210 Mission Dr',
                'website_url': 'https://example.com/pacific-pourhouse',
            },
            'posts': [
                ('event', 'Sunday Jazz Brunch Session', 'Live trio starts at 11am and the patio menu runs until 2pm.', 'This gives Camarillo another nightlife-adjacent event with a softer daytime angle.', 'https://picsum.photos/seed/ddz-pacific-event/1200/800', 'Book Table', 'https://example.com/pacific-pourhouse/events', 1),
                ('special', 'House Spritz Flight', 'Try all three seasonal spritzes for $16 this week only.', 'The card is a good benchmark for how drink-forward specials look in the home feed.', 'https://picsum.photos/seed/ddz-pacific-special/1200/800', 'See Flight', 'https://example.com/pacific-pourhouse/menu', 2),
                ('announcement', 'Patio Shades Installed', 'The west patio finally has retractable shade for late afternoons.', 'A very practical venue update helps the feed feel less like pure advertising.', 'https://picsum.photos/seed/ddz-pacific-announce/1200/800', 'View Patio', 'https://example.com/pacific-pourhouse/updates', 4),
            ],
            'sponsored': [1],
        },
        {
            'username': 'demo_feed_palm_garden_goods',
            'email': 'demo.palm.garden.goods@example.com',
            'snapshot': {
                'listing_slug': 'palm-garden-goods-oxnard',
                'name': 'Palm Garden Goods',
                'city': City.OXNARD,
                'venue_type': VenueType.SHOP,
                'address_line_1': '38 Heritage Sq',
                'website_url': 'https://example.com/palm-garden-goods',
            },
            'posts': [
                ('announcement', 'Plant Care Bar Launch', 'Bring in any houseplant purchase and get a free repot consult this week.', 'A retail service update helps balance the feed with non-food businesses too.', 'https://picsum.photos/seed/ddz-palm-announce/1200/800', 'See Details', 'https://example.com/palm-garden-goods/updates', 1),
                ('blog', 'Three Patio Plants That Survive Coastal Wind', 'A short staff guide built around what actually lasts near Oxnard and Ventura patios.', 'This is a local-content example that fits a marketplace app without pretending every post is a sale.', 'https://picsum.photos/seed/ddz-palm-blog/1200/800', 'Read Guide', 'https://example.com/palm-garden-goods/blog', 2),
                ('special', 'Weekend Pottery Bundle', 'Pick any medium planter and get 20% off a matching saucer.', 'Retail specials should still read naturally in the same feed stack as restaurant deals.', 'https://picsum.photos/seed/ddz-palm-special/1200/800', 'Shop Bundle', 'https://example.com/palm-garden-goods/shop', 3),
            ],
            'sponsored': [2],
        },
        {
            'username': 'demo_feed_harbor_bowl',
            'email': 'demo.harbor.bowl@example.com',
            'snapshot': {
                'listing_slug': 'harbor-bowl-camarillo',
                'name': 'Harbor Bowl Kitchen',
                'city': City.CAMARILLO,
                'venue_type': VenueType.RESTAURANT,
                'address_line_1': '700 Las Posas Rd',
                'website_url': 'https://example.com/harbor-bowl-kitchen',
            },
            'posts': [
                ('special', 'Salmon Rice Bowl Lunch Drop', 'Our miso salmon bowl is $4 off from 11am-2pm weekdays.', 'This gives the feed another clean, food-forward lunch card for Camarillo.', 'https://picsum.photos/seed/ddz-harbor-special/1200/800', 'See Lunch Menu', 'https://example.com/harbor-bowl-kitchen/menu', 1),
                ('blog', 'How We Build the Citrus Slaw', 'Chef notes on why we changed the acid balance for warmer weather.', 'Another editorial post keeps the feed from feeling like every business uses the exact same format.', 'https://picsum.photos/seed/ddz-harbor-blog/1200/800', 'Read Notes', 'https://example.com/harbor-bowl-kitchen/blog', 3),
                ('announcement', 'Online Waitlist Live', 'You can now join our dinner waitlist before leaving home.', 'A strong utility announcement is useful when you are reviewing feed readability and variety.', 'https://picsum.photos/seed/ddz-harbor-announce/1200/800', 'Open Waitlist', 'https://example.com/harbor-bowl-kitchen/waitlist', 4),
            ],
            'sponsored': [0],
        },
    ]


def get_demo_home_feed_usernames():
    return [spec['username'] for spec in get_demo_home_feed_business_specs()]


@transaction.atomic
def seed_demo_home_feed(reference_time=None):
    user_model = get_user_model()
    now = reference_time or timezone.now()
    seeded_posts = 0
    seeded_campaigns = 0
    business_specs = get_demo_home_feed_business_specs()

    for business_index, spec in enumerate(business_specs):
        user, _ = user_model.objects.get_or_create(
            username=spec['username'],
            defaults={
                'email': spec['email'],
                'first_name': spec['snapshot']['name'].split()[0],
                'last_name': 'Demo',
            },
        )
        if not user.email:
            user.email = spec['email']
            user.save(update_fields=['email'])

        snapshot, _ = ListingSnapshot.objects.update_or_create(
            listing_slug=spec['snapshot']['listing_slug'],
            defaults={
                'name': spec['snapshot']['name'],
                'city': spec['snapshot']['city'],
                'venue_type': spec['snapshot']['venue_type'],
                'address_line_1': spec['snapshot']['address_line_1'],
                'website_url': spec['snapshot']['website_url'],
                'source_name': DEMO_HOME_FEED_SOURCE_NAME,
                'source_url': spec['snapshot']['website_url'],
            },
        )

        claim, _ = BusinessClaim.objects.update_or_create(
            claimant=user,
            listing_snapshot=snapshot,
            defaults={
                'pathway': BusinessClaim.Pathway.ESTABLISHED if spec['snapshot']['venue_type'] != VenueType.MOBILE else BusinessClaim.Pathway.INFORMAL,
                'status': BusinessClaim.Status.APPROVED,
                'contact_name': f"{snapshot.name} Owner",
                'work_email': spec['email'],
                'work_phone': '805-555-0100',
                'business_website_url': spec['snapshot']['website_url'],
                'submitted_at': now - timedelta(days=14),
                'reviewed_at': now - timedelta(days=13),
            },
        )

        membership, _ = BusinessMembership.objects.update_or_create(
            claim=claim,
            defaults={
                'user': user,
                'approved_at': now - timedelta(days=13),
                'is_active': True,
            },
        )

        created_posts = []
        for post_index, (content_type, title, summary, body, hero_image_url, cta_label, cta_url, days_ago) in enumerate(spec['posts']):
            published_at = now - timedelta(days=days_ago, hours=business_index + post_index)
            post, _ = BusinessPost.objects.update_or_create(
                membership=membership,
                slug=f'demo-{business_index + 1}-{post_index + 1}',
                defaults={
                    'content_type': content_type,
                    'status': BusinessPost.Status.PUBLISHED,
                    'title': title,
                    'summary': summary,
                    'body': body,
                    'hero_image_url': hero_image_url,
                    'cta_label': cta_label,
                    'cta_url': cta_url,
                    'published_at': published_at,
                    'starts_at': published_at if content_type == BusinessPost.ContentType.EVENT else None,
                    'ends_at': published_at + timedelta(days=2) if content_type == BusinessPost.ContentType.EVENT else None,
                },
            )
            created_posts.append(post)
            seeded_posts += 1

        for sponsored_index in spec['sponsored']:
            post = created_posts[sponsored_index]
            SponsoredCampaign.objects.update_or_create(
                membership=membership,
                post=post,
                defaults={
                    'name': f'{post.title} Boost',
                    'status': SponsoredCampaign.Status.ACTIVE,
                    'billing_model': SponsoredCampaign.BillingModel.WEEKLY_SUBSCRIPTION,
                    'weekly_price_cents': 1500,
                    'weekly_impression_quota': 500,
                    'target_cities': [] if snapshot.city == City.OXNARD else [snapshot.city],
                    'target_venue_types': [],
                    'starts_at': now - timedelta(days=2),
                    'ends_at': now + timedelta(days=12),
                },
            )
            seeded_campaigns += 1

    return {
        'business_count': len(business_specs),
        'post_count': seeded_posts,
        'campaign_count': seeded_campaigns,
    }


@transaction.atomic
def cleanup_demo_home_feed():
    user_model = get_user_model()
    usernames = get_demo_home_feed_usernames()

    post_count = BusinessPost.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count()
    campaign_count = SponsoredCampaign.objects.filter(post__listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count()
    claim_count = BusinessClaim.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count()
    snapshot_count = ListingSnapshot.objects.filter(source_name=DEMO_HOME_FEED_SOURCE_NAME).count()
    user_count = user_model.objects.filter(username__in=usernames).count()

    BusinessClaim.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).delete()
    ListingSnapshot.objects.filter(source_name=DEMO_HOME_FEED_SOURCE_NAME).delete()
    user_model.objects.filter(username__in=usernames).delete()

    return {
        'post_count': post_count,
        'campaign_count': campaign_count,
        'claim_count': claim_count,
        'snapshot_count': snapshot_count,
        'user_count': user_count,
    }
