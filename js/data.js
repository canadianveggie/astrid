class Data {
	constructor (dataAsJson, columns) {
		this.columns = columns;
		this.data = [];
		this.rows = [];

		_.each(dataAsJson, function (datum) {

			// Trim property names in datum
			var trimDatum = {};
			_.each(datum, function (value, key) {
				trimDatum[key.trim()] = value;
			});

			var columnData = [];
			var cleansedDatum = {};
			_.each(columns, function (column) {
				let value;
				if (column.derivativeFn) {
					// Pass columnData for previously defined columns and raw row
					value = column.derivativeFn(columnData, trimDatum);
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
							value = new Date(value);
						}
					}
				}

				columnData.push({v: value});
				cleansedDatum[column.id] = value;
			}, this);
			this.data.push(cleansedDatum);
			this.rows.push({c: columnData});
		}, this);
	}

	columnIdToIndex(columnId) {
		return _.findIndex(this.columns, function (column) {
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
			view.setColumns(_.map(columnIds, function (column) {
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

	constructor (data) {
		const diaperChangeDuration = 3 * 60 * 1000; // 3 minutes
		// id, Time, Type, Notes
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'time', label: 'Time', type: 'datetime'},
			{id: 'start', label: 'Start Time', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return new Date(time.getTime() - diaperChangeDuration);
			}, type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return time;
			}, type: 'datetime'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return new Date(time.getFullYear(), time.getMonth(), time.getDate());
			}, type: 'date'},
			{id: 'type', label: 'Type', type: 'string'},
			{id: 'note', label: 'Note', type: 'string'}
		]);
	}

	get diapersByDay () {
		return _.groupBy(this.data, 'day', this);
	}

	diapersPerDay () {
		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'pees', label: 'Pees', type: 'number'});
		dataTable.addColumn({id: 'poos', label: 'Poos', type: 'number'});

		_.each(this.diapersByDay, function (diapers, day) {
			let pees = 0, poos = 0;
			_.each(diapers, function (diaper) {
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
	constructor (data) {
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = rawRow['End Time'];
				if (endTime) {
					return new Date(endTime);
				} else {
					return new Date(startTime.getTime() + rawRow['Duration (Minutes)'] * 60 * 1000);
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let time = columnData[3].v;
				return new Date(time.getFullYear(), time.getMonth(), time.getDate());
			}, type: 'date'},
			{id: 'type', label: 'Feed Type', type: 'string'},
			{id: 'quantity', label: 'Quantity', originalLabel: 'Quantity (oz)', type: 'number'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'duration', label: 'Duration', originalLabel: 'Duration (Minutes)', type: 'number'},
			{id: 'foodType', label: 'Food Type', type: 'string'},
			{id: 'unit', label: 'unit', type: 'string'},
			{id: 'bottleType', label: 'Bottle Type', type: 'string'}
		]);
	}

	// Feeding sessions group two or more feedings that happen within 15 minutes of each other
	// Used to group feedings on the left/right breast together into one feeding session
	get sessions () {
		let fifteenMinutes = 15 * 60 * 1000;
		let sessions = [];
		_.each(this.data, function (feeding) {
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

		_.each(this.sessionsByDay, function (feedings, day) {
			feedings = _.sortBy(feedings, 'start');
			let durationsBetween = [];
			for (let i=0; i < feedings.length - 1; i++) {
				let duration = feedings[i+1].start.valueOf() - feedings[i].start.valueOf();
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
	combined.start = new Date(Math.min(feedingA.start, feedingB.start));
	combined.end = new Date(Math.max(feedingA.end, feedingB.end));
	combined.time = new Date((combined.start.getTime() + combined.end.getTime()) / 2);
	combined.day = new Date(combined.time.getFullYear(), combined.time.getMonth(), combined.time.getDate());
	if (feedingA.type !== feedingB.type) {
		combined.type = 'session';
	}
	combined.quantity = feedingA.quantity + feedingB.quantity;
	combined.note = !feedingA.note ? feedingB.note : (!feedingB.note ? feedingA.note : feedingA.note + ' ' + feedingB.note);
	combined.duration = feedingA.duration + feedingB.duration;

	return combined;
}

class Growths extends Data {
	constructor (data) {
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
		]);
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
		var sortedByDate = _.chain(this.data).filter(function (growth) {
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

		_.each(this.data, function (growth) {
			if (growth.weight) {
				let age = metadata.ageOnDate(growth.day);
				let row = [growth.day,
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
	constructor (data, dayNightStartHour, dayNightEndHour) {
		// Nighttime - 6pm to 7 am
		dayNightStartHour = dayNightStartHour || 18;
		dayNightEndHour = dayNightEndHour || 6;
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = rawRow['End Time'];
				if (endTime) {
					return new Date(endTime);
				} else {
					return new Date(startTime.getTime() + rawRow['Approximate Duration (Minutes)'] * 60 * 1000);
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'duration', label: 'Duration', originalLabel: 'Approximate Duration (Minutes)', type: 'number'},
			{id: 'type', label: 'Type', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return time.getHours() >= dayNightStartHour|| time.getHours() < dayNightEndHour ? 'Night' : 'Nap';
			}, type: 'string'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let time = columnData[3].v;
				let dayAdjustment = (time.getHours() < dayNightEndHour) ? -1 : 0;
				return new Date(time.getFullYear(), time.getMonth(), time.getDate() + dayAdjustment);
			}, type: 'date'},
			{id: 'durationHour', label: 'Duration', derivativeFn: function (columnData, rawRow) {
				return math.round(columnData[5].v / 60, 1);
			}, type: 'number'}
		]);
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
			longest.push(_.reduce(durations, function (s, n) {
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

		_.each(this.sleepsByDay, function (sleepDay, day) {
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
		return _.reduce(this.data, function (hours, sleep) {
			return hours + sleep.duration / 60;
		}, 0);
	}

	get sleepsByDay() {
		return _.groupBy(this.data, 'day', this);
	}
}

class Journals extends Data {
	constructor (data) {
		super(data, [
			{id: 'id', label: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', type: 'datetime'},
			{id: 'category', label: 'Category', type: 'string'},
			{id: 'type', label: 'Type', originalLabel: 'Sub Category', type: 'string'},
			{id: 'note', label: 'Note', type: 'string'},
			{id: 'timed', label: 'Timed', originalLabel: 'Uses Timer', type: 'boolean'}
		]);
	}

	fiterBySubCategory (subCategory) {
		return _.where(this.data, {})
	}
}


class TimelineData {
	constructor (datas, startDate, endDate) {
		var timelineViews = _.map(datas, function (data, category) {
			let timelineView = data.dataView([
				{id: 'category', label: 'Category', type: 'string', calc: function () { return category; }},
				'type',
				{id: 'tooltip', label: 'Tooltip', type: 'string', role: 'tooltip', p: {html:true}, calc: function (datatable, row) {
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

		var combinedJson = _.reduce(timelineViews, function (combined, timelineView) {
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
			this.birthdate = new Date();
		} else {
			this.birthdate = new Date(this.data.birthdate);
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
		return this.ageOnDate(new Date());
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
