function addHeaderShrink() {
	window.addEventListener('scroll', (e) => {
		var distanceY = window.pageYOffset || document.documentElement.scrollTop,
			shrinkOn = 50,
			navbar = $(".navbar-nav");
		if (distanceY > shrinkOn) {
			navbar.addClass("smaller");
		} else {
			if (navbar.hasClass("smaller")) {
				navbar.removeClass("smaller");
			}
		}
	});
}
