class Data {
	constructor (dataAsJson, columns, dateFormat) {
		this.columns = columns;
		this.data = [];
		this.rows = [];
		this.dateFormat = dateFormat;

		_.each(dataAsJson, (datum) => {

			// Trim property names in datum
			var trimDatum = {};
			_.each(datum, (value, key) => {
				trimDatum[key.trim()] = value;
			});

			var columnData = [];
			var cleansedDatum = {};
			_.each(columns, (column) => {
				let value;
				if (column.derivativeFn) {
					// Pass columnData for previously defined columns and raw row
					value = column.derivativeFn(cleansedDatum, trimDatum);
				} else {
					value = trimDatum[column.originalLabel || column.label];
					if (value) {
						if (column.type === 'boolean') {
							value = value > 0;
						} else if (column.type === 'number') {
							value = parseFloat(value);
							// FeedBaby exports null numeric data as 0, replace with null
							if (!value) {
								value = null;
							}
						} else if (column.type === 'date' || column.type === 'datetime') {
							value = moment(value, dateFormat);
						}
					}
				}

				var googleValue = value;
				if (column.type === 'date' || column.type === 'datetime') {
					googleValue = value.toDate();
				}

				columnData.push({v: googleValue});
				cleansedDatum[column.id] = value;
			}, this);
			this.data.push(cleansedDatum);
			this.rows.push({c: columnData});
		}, this);
	}

	columnIdToIndex(columnId) {
		return _.findIndex(this.columns, (column) => {
			return column.id === columnId;
		})
	}

	dataTable() {
		return new google.visualization.DataTable({
			cols: this.columns,
			rows: this.rows
		});
	}

	dataView(columnIds) {
		var view = new google.visualization.DataView(this.dataTable());

		if (columnIds) {
			view.setColumns(_.map(columnIds, (column) => {
				if (_.isNumber(column)) {
					return this.columnIdToIndex(column);
				} else {
					if (column.sourceColumn) {
						column.sourceColumn = this.columnIdToIndex(column.sourceColumn);
					}
					return column;
				}
			}, this));
		}

		return view;
	}

	largest(property) {
		return _.chain(this.data)
			.pluck(property)
			.max()
			.value();
	}
}

class Excretions extends Data {

	constructor (data, dateFormat) {
		const diaperChangeDurationInMinutes = 3; // 3 minutes
		// id, Time, Type, Notes
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'time', label: 'Time', type: 'datetime'},
			{id: 'start', label: 'Start Time', derivativeFn: (cleansedData, rawRow) => {
				return cleansedData['time'].clone().subtract(diaperChangeDurationInMinutes, 'minutes');
			}, type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: (cleansedData, rawRow) => {
				return cleansedData['time'].clone();
			}, type: 'datetime'},
			{id: 'day', label: 'Day', derivativeFn: (cleansedData, rawRow) => {
				return cleansedData['time'].clone().startOf('day');
			}, type: 'date'},
			{id: 'type', label: 'Type', type: 'string'},
			{id: 'note', label: 'Note', type: 'string'}
		], dateFormat);
	}

	get diapersByDay () {
		return _.groupBy(this.data, 'day', this);
	}

	diapersPerDay () {
		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'pees', label: 'Pees', type: 'number'});
		dataTable.addColumn({id: 'poos', label: 'Poos', type: 'number'});

		_.each(this.diapersByDay, (diapers, day) => {
			let pees = 0, poos = 0;
			_.each(diapers, (diaper) => {
				if (diaper.type === 'Pee') {
					pees++;
				} else if (diaper.type === 'Pee and Poo' || diaper.type === 'Poo') {
					poos++;
				}
			});
			dataTable.addRow([new Date(day),pees, poos]);
		});

		return dataTable;
	}
}

class Feeds extends Data {
	constructor (data, dateFormat) {
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: (cleansedData, rawRow) => {
				let startTime = cleansedData['start'];
				let endTime = rawRow['End Time'];
				if (endTime) {
					return moment(endTime, dateFormat);
				} else {
					return startTime.clone().add(rawRow['Duration (Minutes)'], 'minutes');
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: (cleansedData, rawRow) => {
				let startTime = cleansedData['start'];
				let endTime = cleansedData['end'];
				return moment((startTime.valueOf() + endTime.valueOf()) / 2)
			}, type: 'datetime'},
			{id: 'day', label: 'Day', derivativeFn: (cleansedData, rawRow) => {
				return cleansedData['time'].clone().startOf('day');
			}, type: 'date'},
			{id: 'type', label: 'Feed Type', type: 'string'},
			{id: 'quantity', label: 'Quantity', originalLabel: 'Quantity (oz)', type: 'number'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'duration', label: 'Duration', originalLabel: 'Duration (Minutes)', type: 'number'},
			{id: 'foodType', label: 'Food Type', type: 'string'},
			{id: 'unit', label: 'unit', type: 'string'},
			{id: 'bottleType', label: 'Bottle Type', type: 'string'}
		], dateFormat);
	}

	// Feeding sessions group two or more feedings that happen within 15 minutes of each other
	// Used to group feedings on the left/right breast together into one feeding session
	get sessions () {
		let fifteenMinutes = 15 * 60 * 1000;
		let sessions = [];
		_.each(this.data, (feeding) => {
			if (sessions.length) {
				let lastSession = _.last(sessions);
				let timeBetween = Math.max(feeding.start.valueOf() - lastSession.end.valueOf(), lastSession.start.valueOf() - feeding.end.valueOf());
				if (timeBetween < fifteenMinutes) {
					// Replace the last feeding
					sessions.pop();
					feeding = combineFeedings(lastSession, feeding);
				}
			}
			sessions.push(feeding);
		});
		return sessions;
	}

	get sessionsByDay () {
		return _.groupBy(this.sessions, 'day', this);
	}

	medianTimeBetweenFeedings () {
		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'median', label: 'Median Time Between Feedings', type: 'number'});
		dataTable.addColumn({id: 'feedingsPerDay', label: 'Feedings Per Day', type: 'number'});

		_.each(this.sessionsByDay, (feedings, day) => {
			feedings = _.sortBy(feedings, 'start');
			let durationsBetween = [];
			for (let i=0; i < feedings.length - 1; i++) {
				let duration = feedings[i+1].start - feedings[i].start;
				durationsBetween.push(duration / 1000 / 60 / 60); // In hours
			}
			if (durationsBetween.length) {
				dataTable.addRow([new Date(day), math.round(math.median(durationsBetween), 1), feedings.length]);
			}
		});

		return dataTable;
	}
}

function combineFeedings(feedingA, feedingB) {
	let combined = _.extend({}, feedingA, feedingB);
	combined.id = 'session' + feedingA.id + ':' + feedingB.id;
	combined.start = moment.min(feedingA.start, feedingB.start);
	combined.end = moment.max(feedingA.end, feedingB.end);
	combined.time = moment((combined.start.valueOf() + combined.end.valueOf()) / 2);
	combined.day = combined.time.clone().startOf('day');
	if (feedingA.type !== feedingB.type) {
		combined.type = 'session';
	}
	combined.quantity = feedingA.quantity + feedingB.quantity;
	combined.note = !feedingA.note ? feedingB.note : (!feedingB.note ? feedingA.note : feedingA.note + ' ' + feedingB.note);
	combined.duration = feedingA.duration + feedingB.duration;

	return combined;
}

class Growths extends Data {
	constructor (data, dateFormat) {
		// id, Day, Weight, Weight Unit, Height, Head, Length Unit, Notes
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'day', label: 'Day', type: 'date'},
			{id: 'weight', label: 'Weight', type: 'number'},
			{id: 'weightUnit', label: 'Weight Unit', type: 'string'},
			{id: 'height', label: 'Height', type: 'number'},
			{id: 'head', label: 'Head', type: 'number'},
			{id: 'lengthUnit', label: 'Length Unit', type: 'string'},
			{id: 'note', label: 'Note', type: 'string'}
		], dateFormat);
	}

	convertToKg(weight, unit) {
		if (unit === 'g') {
			return weight / 1000;
		} else if (unit === 'oz') {
			return weight / 35.274;
		} else {
			throw new Error('Unsupported unit ' + unit);
		}
	}

	get weightChange () {
		if (!this.data.length) {
			return 0;
		}
		var sortedByDate = _.chain(this.data).filter((growth) => {
			return growth.weight > 0;
		}).sortBy('day').value();
		var latestWeight = this.convertToKg(_.last(sortedByDate).weight, _.last(sortedByDate).weightUnit);
		var earliestWeight = this.convertToKg(_.first(sortedByDate).weight, _.first(sortedByDate).weightUnit);
		return latestWeight / earliestWeight;
	}

	weightWithPercentiles(percentilesByAge, metadata) {
		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'weight', label: 'Weight', type: 'number'});
		dataTable.addColumn({id: 'p25', label: '25th Percentile', type: 'number', role: 'interval'});
		dataTable.addColumn({id: 'p75', label: '75th Percentile', type: 'number', role: 'interval'});

		_.each(this.data, (growth) => {
			if (growth.weight) {
				let age = metadata.ageOnDate(growth.day);
				let row = [growth.day.toDate(),
					this.convertToKg(growth.weight, growth.weightUnit),
					percentilesByAge.percentileAtAge(age, 25),
					percentilesByAge.percentileAtAge(age, 75)
				];
				dataTable.addRow(row);
			}
		}, this);

		return dataTable;
	}
}

class Sleeps extends Data {
	constructor (data, dateFormat, dayNightStartHour, dayNightEndHour) {
		// Nighttime - 6pm to 7 am
		dayNightStartHour = dayNightStartHour || 18;
		dayNightEndHour = dayNightEndHour || 6;
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: (cleansedData, rawRow) => {
				let startTime = cleansedData['start'];
				let endTime = rawRow['End Time'];
				if (endTime) {
					return moment(endTime, dateFormat);
				} else {
					return startTime.clone().add(rawRow['Approximate Duration (Minutes)'], 'minutes');
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: (cleansedData, rawRow) => {
				let startTime = cleansedData['start'];
				let endTime = cleansedData['end'];
				return moment((startTime.valueOf() + endTime.valueOf()) / 2)
			}, type: 'datetime'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'duration', label: 'Duration', originalLabel: 'Approximate Duration (Minutes)', type: 'number'},
			{id: 'type', label: 'Type', derivativeFn: (cleansedData, rawRow) => {
				let time = cleansedData['start'];
				return time.hours() >= dayNightStartHour|| time.hours() < dayNightEndHour ? 'Night' : 'Nap';
			}, type: 'string'},
			{id: 'day', label: 'Day', derivativeFn: (cleansedData, rawRow) => {
				let time = cleansedData['time'];
				let dayAdjustment = (time.hours() < dayNightEndHour) ? -1 : 0;
				return time.clone().startOf('day').add(dayAdjustment, 'days');
			}, type: 'date'},
			{id: 'durationHour', label: 'Duration', derivativeFn: (cleansedData, rawRow) => {
				return math.round(cleansedData['duration'] / 60, 1);
			}, type: 'number'}
		], dateFormat);
	}

	longestDurationsDataTable(type) {
		// Returns duration of longest n sleeps plush remainder in an array
		// Result is always an array of n+1 elements
		function longestDurations (sleeps, n) {
			let durations = _.pluck(sleeps, 'durationHour').sort(function(a, b) {
				return b - a;
			});
			if (durations[0] < durations[1]) {
				console.log(durations, sleeps);
			}
			let longest = durations.splice(0, n);
			// Add remainder
			longest.push(_.reduce(durations, (s, n) => {
				return s+n;
			}, 0));
			// Ensure we have n + 1 results
			while (longest.length < n + 1) {
				longest.push(0);
			}
			return longest;
		}

		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'longest', label: 'Longest', type: 'number'});
		dataTable.addColumn({id: 'secondLongest', label: 'Second Longest', type: 'number'});
		dataTable.addColumn({id: 'remainder', label: 'Remainder', type: 'number'});

		_.each(this.sleepsByDay, (sleepDay, day) => {
			let halfDaySleep = _.where(sleepDay, {'type': type});
			let sleepDurations = longestDurations(halfDaySleep, 2);
			sleepDurations.unshift(new Date(day));

			dataTable.addRow(sleepDurations);
		});

		return dataTable;
	}

	naps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Nap'}]));

		return view;
	}

	nightSleeps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Night'}]));

		return view;
	}

	get totalHours() {
		return _.reduce(this.data, (hours, sleep) => {
			return hours + sleep.duration / 60;
		}, 0);
	}

	get sleepsByDay() {
		return _.groupBy(this.data, 'day', this);
	}
}

class Journals extends Data {
	constructor (data, dateFormat) {
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', type: 'datetime'},
			{id: 'category', label: 'Category', type: 'string'},
			{id: 'type', label: 'Type', originalLabel: 'Sub Category', type: 'string'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'timed', label: 'Timed', originalLabel: 'Uses Timer', type: 'boolean'}
		], dateFormat);
	}

	fiterBySubCategory (subCategory) {
		return _.where(this.data, {})
	}
}


class TimelineData {
	constructor (datas, startDate, endDate) {
		var timelineViews = _.map(datas, (data, category) => {
			let timelineView = data.dataView([
				{id: 'category', label: 'Category', type: 'string', calc: () => category},
				'type',
				{id: 'tooltip', label: 'Tooltip', type: 'string', role: 'tooltip', p: {html:true}, calc: (datatable, row) => {
					let type = datatable.getValue(row, data.columnIdToIndex('type'));
					let start = datatable.getValue(row, data.columnIdToIndex('start'));
					let end = datatable.getValue(row, data.columnIdToIndex('end'));
					let note = datatable.getValue(row, data.columnIdToIndex('note'));
					var tooltip = '<strong>Type</strong>: ' + type + '<br>' + start + ' - ' + end;
					if (note) {
						tooltip += '<br><strong>Note</strong>: ' + note;
					}
					return tooltip;
				}},
				'start',
				'end'
			]);

			if (startDate) {
				timelineView.setRows(timelineView.getFilteredRows([{column: 3, minValue: startDate}]));
			}
			if (endDate) {
				timelineView.setRows(timelineView.getFilteredRows([{column: 3, maxValue: endDate}]));
			}
			return timelineView;
		});

		var combinedJson = _.reduce(timelineViews, (combined, timelineView) => {
			var jsonObject = JSON.parse(timelineView.toDataTable().toJSON());
			if (combined.rows) {
				jsonObject.rows = combined.rows.concat(jsonObject.rows);
			}
			return jsonObject;
		}, {});

		this.dataTable = new google.visualization.DataTable(combinedJson);
	}
}

class Metadata {
	constructor (data) {
		this.data = data;
		if (!this.data.birthdate) {
			this.birthdate = moment();
		} else {
			this.birthdate = moment(this.data.birthdate);
		}
	}

	birthdate () {
		return this.birthdate;
	}

	ageOnDate (date) {
		return (date - this.birthdate) / 24/60/60/1000;
	}

	ageOnDateFormatted (date) {
		let days = this.ageOnDate(date);
		if (days < 1) {
			return math.round(days * 24, 0) + ' hours';
		}
		else if (days < 1.5) {
			return '1 day';
		}
		else if (days < 28) {
			return math.round(days, 0) + ' days';
		}
		return math.round(days / 7, 0) + ' weeks';
	}

	get ageInDays () {
		return this.ageOnDate(moment());
	}

	get ageInWeeks () {
		return math.round(this.ageInDays / 7, 1);
	}
}

class GrowthPercentiles {
	constructor (data) {
		// Age,L,M,S,P01,P1,P3,P5,P10,P15,P25,P50,P75,P85,P90,P95,P97,P99,P999
		// Indexed by age
		this.data=data;
	}

	percentileAtAge (ageInDays, percentile) {
		ageInDays = Math.round(ageInDays);
		if (ageInDays < 0 || ageInDays >= this.data.length) {
			return NaN;
		}
		return parseFloat(this.data[ageInDays]['P' + percentile]);
	}
}
