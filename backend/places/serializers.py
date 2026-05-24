from rest_framework import serializers


class HappyHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	start_time = serializers.CharField()
	end_time = serializers.CharField()
	all_day = serializers.BooleanField()


class OperatingHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	open_time = serializers.CharField()
	close_time = serializers.CharField()


class DealSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	title = serializers.CharField()
	description = serializers.CharField()
	deal_type = serializers.CharField()
	deal_type_label = serializers.CharField()
	price_text = serializers.CharField()
	terms = serializers.CharField()
	is_active = serializers.BooleanField()
	starts_on = serializers.CharField(allow_null=True)
	ends_on = serializers.CharField(allow_null=True)
	happy_hours = HappyHourSerializer(many=True)


class PlaceLocationSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	slug = serializers.CharField()
	name = serializers.CharField()
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	operating_hours = OperatingHourSerializer(many=True, required=False, default=list)
	is_active = serializers.BooleanField()


class PlaceLocationDetailSerializer(PlaceLocationSerializer):
	deals = DealSerializer(many=True)


class PlaceListSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	name = serializers.CharField()
	slug = serializers.CharField()
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	is_active = serializers.BooleanField()
	locations = PlaceLocationSerializer(many=True, required=False, default=list)


class PlaceDetailSerializer(PlaceListSerializer):
	deals = DealSerializer(many=True)
	locations = PlaceLocationDetailSerializer(many=True, required=False, default=list)
