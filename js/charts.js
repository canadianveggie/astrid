class Chart {
	constructor (chart, dataTable, options) {
		this.chart = chart;
		this.dataTable = dataTable;
		this.options = options || {};
	}

	draw () {
		this.chart.draw(this.dataTable, this.options);
	}
}


class TimelineChart extends Chart {
	constructor (div, sleeps, feeds, excretions, journals) {
		var timeline = new google.visualization.Timeline(div);

		var lastDataDate = new Date(_.max([sleeps.largest('end'), feeds.largest('end')]));
		var timelineStart = new Date(lastDataDate.valueOf());
		timelineStart.setDate(lastDataDate.getDate() - 7); // 7 days before last event
		var timelineData = new TimelineData({Sleep: sleeps, Feeds: feeds, Diapers: excretions, Journal: journals}, timelineStart);

		var options = {
			timeline: {
				showBarLabels:false
			}
		};

		super(timeline, timelineData.dataTable, {timeline: {showBarLabels:false}});
	}
}

class NightSleepChart extends Chart {
	constructor (div, sleeps) {
		var chart = new google.visualization.SteppedAreaChart(div);

		var dataTable = sleeps.longestDurationsDataTable('Night');
		var options = {
			isStacked: true,
			vAxis: {
				title: 'Hours'
			}
		};

		super(chart, dataTable, options);
	}
}

class SleepChart extends Chart {
	constructor (div, sleeps) {
		var chart = new google.visualization.ColumnChart(div);

		var dataView = sleeps.dataView(['day', 'durationHour']);
		var dataTable = google.visualization.data.group(dataView.toDataTable(), [0], [
			{column: 1, label: 'Duration', aggregation: google.visualization.data.sum, type: 'number'}
		]);

		var options = {
			vAxis: {
				title: 'Hours'
			}
		};

		super(chart, dataTable, options);
	}
}

class FeedingsChart extends Chart {
	constructor (div, feeds) {
		var chart = new google.visualization.ComboChart(div);

		var dataTable = feeds.medianTimeBetweenFeedings();

		var options = {
			seriesType: 'bars',
			series: {1: {type: 'line', targetAxisIndex: 1}},
			vAxes: {
				0: {
					title: 'Hours'
				},
				1: {
					format: 'short'
				}
			}
		};

		super(chart, dataTable, options);
	}
}

class DiapersChart extends Chart {
	constructor (div, excretions) {
		var chart = new google.visualization.SteppedAreaChart(div);

		var dataTable = excretions.diapersPerDay();

		var options = {
			isStacked: true,
			colors: ['#FFFF00', '#663300']
		};

		super(chart, dataTable, options);
	}
}

class WeightChart extends Chart {
	constructor (div, growths) {
		var chart = new google.visualization.LineChart(div);

		var dataTable = growths.weightWithPercentiles(weightPercentiles, metadata);

		var options = {
			curveType: 'function',
			interpolateNulls: true,
			lineWidth: 4,
			intervals: { 'style':'area' },
			vAxis: {
				title: 'kg'
			}
		};

		super(chart, dataTable, options);
	}
}

