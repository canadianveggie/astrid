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
			{id: 'diaperChangeType', label: 'Diaper Change Type', orginalLabel: ' Type', type: 'string'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'type', label: 'Type', derivativeFn: function (columnData, rawRow) {
				return 'Diaper Change';
			}, type: 'string'}
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
			{id: 'feedType', label: 'Feed Type', orginalLabel: ' Feed Type', type: 'string'},
			{id: 'Quantity', label: 'Quantity', orginalLabel: ' Quantity (oz)', type: 'number'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'duration', label: 'Duration', orginalLabel: ' Duration (Minutes)', type: 'number'},
			{id: 'foodType', label: 'Food Type', orginalLabel: ' Food Type', type: 'string'},
			{id: 'unit', label: 'unit', orginalLabel: ' Unit', type: 'string'},
			{id: 'bottleType', label: 'Bottle Type', orginalLabel: ' Bottle Type', type: 'string'},
			{id: 'type', label: 'Type', derivativeFn: function (columnData, rawRow) {
				let feedType = columnData[4].v;
				return /Breast/i.test(feedType) ? 'Breast Feed' : feedType;
			}, type: 'string'}
		]);
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
				let time = columnData[3].v;
				return time.getHours() >= dayNightStartHour|| time.getHours() < dayNightEndHour ? 'Night Sleep' : 'Day Nap';
			}, type: 'string'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let time = columnData[3].v;
				let dayAdjustment = (time.getHours() < dayNightEndHour) ? -1 : 0;
				return new Date(time.getFullYear(), time.getMonth(), time.getDate() + dayAdjustment);
			}, type: 'datetime'},
		]);
	}

	longestDurationsDataTable() {
		// Returns duration of longest n sleeps plush remainder in an array
		// Result is always an array of n+1 elements
		function longestDurations (sleeps, n) {
			let durations = _.pluck(sleeps, "duration").sort(function(a, b) {
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
		dataTable.addColumn({id: 'type', label: 'Type', type: 'string'});
		dataTable.addColumn({id: 'longest', label: 'Longest', type: 'number'});
		dataTable.addColumn({id: 'secondLongest', label: 'Second Longest', type: 'number'});
		dataTable.addColumn({id: 'remainder', label: 'Remainder', type: 'number'});

		_.each(this.sleepsByDay, function (sleepDay, day) {
			let napsAndSleeps = _.groupBy(sleepDay, 'type');
			_.each(['Day Nap', 'Night Sleep'], function (type) {
				let sleepDurations = longestDurations(napsAndSleeps[type], 2);
				sleepDurations.unshift(type);
				sleepDurations.unshift(new Date(day));
				dataTable.addRow(sleepDurations);
			});
		});

		return dataTable;
	}

	naps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Day Nap'}]));

		return view;
	}

	nightSleeps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Night Sleep'}]));

		return view;
	}

	get sleepsByDay() {
		return _.groupBy(this.data, "day", this);
	}
}

class TimelineData {
	constructor (datas, startDate, endDate) {
		var timelineViews = _.map(datas, function (data) {
			let timelineView = data.dataView([
				'type',
				{sourceColumn: 'note', role: 'tooltip'},
				'start',
				'end'
			]);

			if (startDate) {
				timelineView.setRows(timelineView.getFilteredRows([{column: 2, minValue: startDate}]));
			}
			if (endDate) {
				timelineView.setRows(timelineView.getFilteredRows([{column: 2, maxValue: endDate}]));
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
