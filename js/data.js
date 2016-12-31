class Data {
	constructor (dataAsJson, columns) {
		this.columns = columns;
		this.data = [];
		this.rows = [];

		_.each(dataAsJson, function (datum) {
			var columnData = [];
			var cleansedDatum = {};
			_.each(columns, function (column) {
				let value;
				if (column.derivativeFn) {
					// Pass columnData for previously defined columns and raw row
					value = column.derivativeFn(columnData, datum);
				} else {
					value = datum[column.orginalLabel];
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
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'time', label: 'Time', orginalLabel: ' Time', type: 'datetime'},
			{id: 'start', label: 'Start Time', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return new Date(time.getTime() - diaperChangeDuration);
			}, type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let time = columnData[1].v;
				return time;
			}, type: 'datetime'},
			{id: 'type', label: 'Type', orginalLabel: ' Type', type: 'string'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'}
		]);
	}
}

class Feeds extends Data {
	constructor (data) {
		super(data, [
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', orginalLabel: ' Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = rawRow[' End Time'];
				if (endTime) {
					return new Date(endTime);
				} else {
					return new Date(startTime.getTime() + rawRow[" Duration (Minutes)"] * 60 * 1000);
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let time = columnData[4].v;
				return new Date(time.getFullYear(), time.getMonth(), time.getDate());
			}, type: 'date'},
			{id: 'type', label: 'Feed Type', orginalLabel: ' Feed Type', type: 'string'},
			{id: 'Quantity', label: 'Quantity', orginalLabel: ' Quantity (oz)', type: 'number'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'duration', label: 'Duration', orginalLabel: ' Duration (Minutes)', type: 'number'},
			{id: 'type', label: 'Food Type', orginalLabel: ' Food Type', type: 'string'},
			{id: 'unit', label: 'unit', orginalLabel: ' Unit', type: 'string'},
			{id: 'bottleType', label: 'Bottle Type', orginalLabel: ' Bottle Type', type: 'string'}
		]);
	}

	get feedingsByDay () {
		return _.groupBy(this.data, 'day', this);
	}

	medianTimeBetweenFeedings () {
		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'median', label: 'Median Time Between Feedings', type: 'number'});
		dataTable.addColumn({id: 'feedingsPerDay', label: 'Feedings Per Day', type: 'number'});

		_.each(this.feedingsByDay, function (feedings, day) {
			feedings = _.sortBy(feedings, "start");
			let durationsBetween = [];
			for (let i=0; i < feedings.length - 1; i++) {
				let duration = feedings[i+1].start.valueOf() - feedings[i].end.valueOf();
				durationsBetween.push(duration / 1000 / 60 / 60); // In hours
			}
			dataTable.addRow([new Date(day), math.round(math.median(durationsBetween), 1), feedings.length]);
		});

		return dataTable;
	}
}

class Growths extends Data {
	constructor (data) {
		// id, Day, Weight, Weight Unit, Height, Head, Length Unit, Notes
		super(data, [
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'day', label: 'Day', orginalLabel: ' Day', type: 'date'},
			{id: 'weight', label: 'Weight', orginalLabel: ' Weight', type: 'number'},
			{id: 'weightUnit', label: 'Weight Unit', orginalLabel: ' Weight Unit', type: 'string'},
			{id: 'height', label: 'Height', orginalLabel: ' Height', type: 'number'},
			{id: 'head', label: 'Head', orginalLabel: ' Head', type: 'number'},
			{id: 'lengthUnit', label: 'Length Unit', orginalLabel: ' Length Unit', type: 'string'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'}
		]);
	}

	weightUnit () {
		return this.data.length && this.data[0].weightUnit;
	}

	lengthUnit () {
		return this.data.length && this.data[0].lengthUnit;
	}

	get weightChange () {
		if (!this.data.length) {
			return 0;
		}
		var sortedByDate = _.chain(this.data).filter(function (growth) {
			return growth.weight > 0;
		}).sortBy("day").value();
		var latestWeight = sortedByDate[sortedByDate.length - 1].weight;
		var earliestWeight = sortedByDate[0].weight;
		return latestWeight / earliestWeight;
	}
}

class Sleeps extends Data {
	constructor (data, dayNightStartHour, dayNightEndHour) {
		// Nighttime - 6pm to 7 am
		dayNightStartHour = dayNightStartHour || 18;
		dayNightEndHour = dayNightEndHour || 6;
		super(data, [
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', orginalLabel: ' Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = rawRow[' End Time'];
				if (endTime) {
					return new Date(endTime);
				} else {
					return new Date(startTime.getTime() + rawRow[" Approximate Duration (Minutes)"] * 60 * 1000);
				}
			}, type: 'datetime'},
			{id: 'time', label: 'Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'duration', label: 'Duration', orginalLabel: ' Approximate Duration (Minutes)', type: 'number'},
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
			let durations = _.pluck(sleeps, "durationHour").sort(function(a, b) {
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
		return _.groupBy(this.data, "day", this);
	}
}

class Journals extends Data {
	constructor (data) {
		super(data, [
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', orginalLabel: ' Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', orginalLabel: ' End Time', type: 'datetime'},
			{id: 'category', label: 'Category', orginalLabel: ' Category', type: 'string'},
			{id: 'type', label: 'Type', orginalLabel: ' Sub Category', type: 'string'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'timed', label: 'Timed', orginalLabel: ' Uses Timer', type: 'boolean'}
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
	}

	get birthdate () {
		if (!this.data.birthdate) {
			return new Date();
		}
		return new Date(this.data.birthdate);
	}

	get ageInDays () {
		return (new Date() - this.birthdate) / 24/60/60/1000;
	}

	get ageInWeeks () {
		return math.round(this.ageInDays / 7, 1);
	}
}
