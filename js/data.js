class Data {
	constructor (data) {
		this.data = _.map(data, function (datum) {
			let cleansed = {};
			_.each(datum, function (value, key) {
				// Add dates and remove leading spaces from keys
				cleansed[key.trim()] = /date|time/i.test(key) ? new Date(value) : value;
			});
			return cleansed;
		});
	}
}

class Excretions extends Data {
}

class Feeds extends Data {
}

class Sleeps extends Data {
	constructor (data, dayNightHour) {
		super(data);
		this.dayNightHour = dayNightHour || 8; // daytime 8 am - 8 pm
		console.assert(this.dayNightHour < 12, 'dayNightHour must be between 0 and 11');
		_.each(this.data, function (sleep) {
			sleep["Start Time"] = sleep["Start Time"] && new Date(sleep["Start Time"]);
			sleep["End Time"] = sleep["End Time"] && new Date(sleep["End Time"]);

			if (sleep["End Time"]) {
				sleep["Mid Time"] = new Date((sleep["Start Time"].getTime() + sleep["End Time"].getTime()) / 2);
			} else {
				sleep["Mid Time"] = sleep["Start Time"];
			}

			sleep["Nap"] = sleep["Mid Time"].getHours() >= this.dayNightHour && sleep["Mid Time"].getHours() < this.dayNightHour + 12;
		}, this);
	}

	get naps() {
		_.where(this.data, {"Nap": true});
	}

	get nightSleeps() {
		_.where(this.data, {"Nap": false});
	}
}

