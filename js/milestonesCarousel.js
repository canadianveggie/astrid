class MilestonesCarousel {
	constructor (milestones, $milestones, metadata) {
		this.milestones = _.chain(milestones).sortBy('date').reverse().value();
		this.$milestones = $milestones;
		this.metadata = metadata;
	}

	draw () {
		_.forEach(this.milestones, (milestone) => {
			let date = moment(milestone.date);
			$('<div>')
				.addClass('milestone')
				.append($('<h4>')
					.html(milestone.title)
				).append($('<h4>')
					.html(date.format('D MMMM YYYY') + " (" + this.metadata.ageOnDateFormatted(date) + ")")
				).append($('<img>')
					.prop('src', milestone.photo)
					.addClass('img-responsive')
				).append($('<h5>')
					.html(milestone.description)
				)
				.appendTo(this.$milestones);
		}, this);

		this.$milestones.slick({
			dots: true,
			infinite: true,
			prevArrow: '<button type="button" class="slick-prev"><span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span></button>',
			nextArrow: '<button type="button" class="slick-next"><span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span></button>',
			speed: 300,
			slidesToShow: 4,
			slidesToScroll: 4,
			responsive: [
				{
				  breakpoint: 1320,
				  settings: {
					slidesToShow: 3,
					slidesToScroll: 3,
					infinite: true,
					dots: true
				  }
				},
				{
				  breakpoint: 990,
				  settings: {
					slidesToShow: 2,
					slidesToScroll: 2,
					dots: false
				  }
				},
				{
				  breakpoint: 660,
				  settings: {
					slidesToShow: 1,
					slidesToScroll: 1,
					dots: false
				  }
				}
			]
		});
	}
}
