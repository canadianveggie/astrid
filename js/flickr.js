class PhotoSet {
	constructor (flickrConfig, $photos) {
		this.flickrConfig = flickrConfig;
		this.$photos = $photos;
	}

	draw () {
		var photosDiv = this.$photos;
		$.ajax({
			url: 'https://api.flickr.com/services/rest/',
			data: {
				format: 'json',
				method: 'flickr.photosets.getPhotos',
				photoset_id: this.flickrConfig.photoset,
				user_id: this.flickrConfig.user_id,
				api_key: this.flickrConfig.api_key
			},
			dataType: 'jsonp',
			jsonp: 'jsoncallback'
		}).done(function (result) {
			var baseUrl;

			// Add the demo images as links with thumbnails to the page:
			if (result.photoset) {
				$.each(_.sample(result.photoset.photo, 50), function (index, photo) {
					baseUrl = 'http://farm' + photo.farm + '.static.flickr.com/' +
						photo.server + '/' + photo.id + '_' + photo.secret;
					$('<a/>')
						.append($('<img>').prop('src', baseUrl + '_s.jpg'))
						.prop('href', 'https://www.flickr.com/photos/' + result.photoset.owner + '/' + photo.id + '/')
						.prop('title', photo.title)
						.prop('target', '_blank')
						.attr('data-gallery', '')
						.appendTo(photosDiv);
				});
			}
		});
	}
}
