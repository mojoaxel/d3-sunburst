(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define(['d3'], factory);
	} else {
		root.Sunburst = factory(root.d3);
	}
}(this, function (d3) {

	var defaultOptions = {
		// DOM Selectors
		selectors: {
			breadcrumbs: 	'#sunburst-breadcrumbs',
			chart: 				'#sunburst-chart',
			description: 	'#sunburst-description',
			legend: 			'#sunburst-legend'
		},

		// Dimensions of sunburst.
		width: 750,
		height: 600,

		// Mapping of step names to colors.
		colors: {},

		// Breadcrumb dimensions: width, height, spacing, width of tip/tail.
		breadcrumbs: {
			w: 75,
			h: 30,
			s: 3,
			t: 10
		},

		// parser settings
		separator: '-'
	};

	var Sunburst = function(options, data) {
		this.opt = Object.assign({}, defaultOptions, options);

		// Total size of all segments; we set this later, after loading the data.
		this.totalSize = 0;

		if (data) {
			this.setData(data);
		}
	}

	Sunburst.prototype.setData = function(data) {
		var json = this.buildHierarchy(data);
		this.createVisualization(json);
	}

	Sunburst.prototype.loadCsv = function(csvFile) {
		// Use d3.text and d3.csv.parseRows so that we do not need to have a header
		// row, and can receive the csv as an array of arrays.
		d3.text(csvFile, function(text) {
			var array = d3.csv.parseRows(text);
			var json = this.buildHierarchy(array);
			this.createVisualization(json);
		}.bind(this));
	}

	// Main function to draw and set up the visualization, once we have the data.
	Sunburst.prototype.createVisualization = function(json) {
		var that = this;
		var radius = Math.min(this.opt.width, this.opt.height) / 2


		this.vis = d3.select(this.opt.selectors.chart).append("svg:svg")
			.attr("width", this.opt.width)
			.attr("height", this.opt.height)
			.append("svg:g")
			.attr("id", "sunburst-container")
			.attr("transform", "translate(" + this.opt.width / 2 + "," + this.opt.height / 2 + ")");

		var arc = d3.svg.arc()
			.startAngle(function(d) { return d.x; })
			.endAngle(function(d) { return d.x + d.dx; })
			.innerRadius(function(d) { return Math.sqrt(d.y); })
			.outerRadius(function(d) { return Math.sqrt(d.y + d.dy); });

		var partition = d3.layout.partition()
			.size([2 * Math.PI, radius * radius])
			.value(function(d) { return d.size; });

		// Basic setup of page elements.
		this.initializeBreadcrumbTrail();
		this.drawLegend();

		// For efficiency, filter nodes to keep only those large enough to see.
		var nodes = partition.nodes(json)
			.filter(function(d) {
				return (d.dx > 0.005); // 0.005 radians = 0.29 degrees
			});

		var all = this.vis.data([json])
			.selectAll("path")
			.data(nodes)
			.enter();

		all.append("svg:path")
			.attr("display", function(d) { return d.depth ? null : "none"; })
			.attr("d", arc)
			.attr("fill-rule", "evenodd")
			.style("fill", function(d) { return that.opt.colors[d.name]; })
			.style("opacity", 1)
			.on("mouseover", that.mouseover.bind(this));

		// some tests with text
		/*
		var arcText = d3.svg.arc()
			.startAngle(function(d) { return d.x; })
			.endAngle(function(d) { return d.x + d.dx; })
			.innerRadius(function(d) { return Math.sqrt(d.y * 0.4); })
			.outerRadius(function(d) { return Math.sqrt(d.y + d.dy * 0.4); })

		var arcsText = arcs.append("svg:path")
			.attr("d", arcText)
			.style("fill", "none")
			.attr("id", function(d, i){
				return "s" + i;
			});
		var texts = all.append("svg:text")
			.attr("dx", "0")
			.attr("dy", "0")
			.style("text-anchor","middle")
			.append("textPath")
			.attr("xlink:href", function(d, i){
				return "#s" + i;
			})
			.attr("startOffset",function(d,i){return "25%";})
			.text(function (d) {
				return d.depth === 1 ? d.name : '';
			});
		*/

		// Add the mouseleave handler to the bounding circle.
		d3.select(this.opt.selectors.chart).on("mouseleave", that.mouseleave.bind(this));

		// Get total size of the tree = value of root node from partition.
		var node =	all.node();
		this.totalSize = node ? node.__data__.value : 0;
	}

	// Fade all but the current sequence, and show it in the breadcrumb trail.
	Sunburst.prototype.mouseover = function(d) {

		var percentage = (100 * d.value / this.totalSize).toPrecision(3);
		var sequenceArray = this.getAncestors(d);

		this.updateDescription(sequenceArray, d.value, percentage)
		this.updateBreadcrumbs(sequenceArray, d.value, percentage);

		// Fade all the segments.
		d3.selectAll("path")
			.style("opacity", 0.3);

			// Then highlight only those that are an ancestor of the current segment.
		this.vis.selectAll("path")
			.filter(function(node) {
				return (sequenceArray.indexOf(node) >= 0);
			})
			.style("opacity", 1);
	}

	// Restore everything to full opacity when moving off the visualization.
	Sunburst.prototype.mouseleave = function(d) {
		var that = this;

		// Hide the breadcrumb trail
		d3.select("#trail")
			.style("visibility", "hidden");

		// Deactivate all segments during transition.
		d3.selectAll("path").on("mouseover", null);

		// Transition each segment to full opacity and then reactivate it.
		//TODO cancel this transition on mouseover
		d3.selectAll("path")
			.transition()
			.duration(1000)
			.style("opacity", 1)
			.each("end", function() {
				d3.select(this).on("mouseover", that.mouseover.bind(that));
			});

		d3.select(this.opt.selectors.description)
			.style("visibility", "hidden");
	}

	// Given a node in a partition layout, return an array of all of its ancestor
	// nodes, highest first, but excluding the root.
	Sunburst.prototype.getAncestors = function(node) {
		var path = [];
		var current = node;
		while (current.parent) {
			path.unshift(current);
			current = current.parent;
		}
		return path;
	}

	Sunburst.prototype.initializeBreadcrumbTrail = function() {
		// Add the svg area.
		var trail = d3.select(this.opt.selectors.breadcrumbs).append("svg:svg")
			.attr("width", this.opt.width)
			.attr("height", 50)
			.attr("id", "trail");
			// Add the label at the end, for the percentage.
		trail.append("svg:text")
		.attr("id", "endlabel")
		.style("fill", "#000");
	}

	// Generate a string that describes the points of a breadcrumb polygon.
	Sunburst.prototype.breadcrumbPoints = function(d, i) {
		var points = [];
		var b = this.opt.breadcrumbs;

		points.push("0,0");
		points.push(b.w + ",0");
		points.push(b.w + b.t + "," + (b.h / 2));
		points.push(b.w + "," + b.h);
		points.push("0," + b.h);
		if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
			points.push(b.t + "," + (b.h / 2));
		}
		return points.join(" ");
	}

	// format the description string in the middle of the chart
	Sunburst.prototype.formatDescription = function(sequence, value, percentage) {
		return percentage < 0.1 ? "< 0.1%" : percentage + '%';
	}

	Sunburst.prototype.updateDescription = function(sequence, value, percentage) {
		d3.select(this.opt.selectors.description)
			.html(this.formatDescription(sequence, value, percentage))
			.style("visibility", "");
	}

	// format the text at the end of the breadcrumbs
	Sunburst.prototype.formatBreadcrumbText = function(sequence, value, percentage) {
		return value + " (" + (percentage < 0.1 ? "< 0.1%" : percentage + "%") + ")";
	}

	// Update the breadcrumb trail to show the current sequence and percentage.
	Sunburst.prototype.updateBreadcrumbs = function(sequence, value, percentage) {
		var that = this;
		var b = this.opt.breadcrumbs;

		// Data join; key function combines name and depth (= position in sequence).
		var g = d3.select("#trail")
			.selectAll("g")
			.data(sequence, function(d) { return d.name + d.depth; });

		// Add breadcrumb and label for entering nodes.
		var entering = g.enter().append("svg:g");

		entering.append("svg:polygon")
			.attr("points", this.breadcrumbPoints.bind(that))
			.style("fill", function(d) { return that.opt.colors[d.name]; });

		entering.append("svg:text")
			.attr("x", (b.w + b.t) / 2)
			.attr("y", b.h / 2)
			.attr("dy", "0.35em")
			.attr("text-anchor", "middle")
			.text(function(d) { return d.name; });

		// Set position for entering and updating nodes.
		g.attr("transform", function(d, i) {
			return "translate(" + i * (b.w + b.s) + ", 0)";
		});

		// Remove exiting nodes.
		g.exit().remove();

		// Now move and update the percentage at the end.
		d3.select("#trail").select("#endlabel")
			.attr("x", (sequence.length + 1) * (b.w + b.s))
			.attr("y", b.h / 2)
			.attr("dy", "0.35em")
			.attr("text-anchor", "middle")
			.html(this.formatBreadcrumbText(sequence, value, percentage));

		// Make the breadcrumb trail visible, if it's hidden.
		d3.select("#trail")
			.style("visibility", "");

	}

	Sunburst.prototype.drawLegend = function() {

		// Dimensions of legend item: width, height, spacing, radius of rounded rect.
		var li = {
			w: 75, h: 30, s: 3, r: 3
		};

		var legend = d3.select(this.opt.selectors.legend).append("svg:svg")
			.attr("width", li.w)
			.attr("height", d3.keys(this.opt.colors).length * (li.h + li.s));

		var g = legend.selectAll("g")
			.data(d3.entries(this.opt.colors))
			.enter().append("svg:g")
			.attr("transform", function(d, i) {
				return "translate(0," + i * (li.h + li.s) + ")";
			});

		g.append("svg:rect")
			.attr("rx", li.r)
			.attr("ry", li.r)
			.attr("width", li.w)
			.attr("height", li.h)
			.style("fill", function(d) { return d.value; });

		g.append("svg:text")
			.attr("x", li.w / 2)
			.attr("y", li.h / 2)
			.attr("dy", "0.35em")
			.attr("text-anchor", "middle")
			.text(function(d) { return d.key; });
	}

	// Take a 2-column CSV and transform it into a hierarchical structure suitable
	// for a partition layout. The first column is a sequence of step names, from
	// root to leaf, separated by hyphens. The second column is a count of how
	// often that sequence occurred.
	Sunburst.prototype.buildHierarchy = function(array) {
		var root = {"name": "root", "children": []};
		for (var i = 0; i < array.length; i++) {
			var sequence = array[i][0];
			var size = +array[i][1];
			if (isNaN(size)) { // e.g. if this is a header row
				continue;
			}
			var parts = sequence.split(this.opt.separator);
			var currentNode = root;
			for (var j = 0; j < parts.length; j++) {
				var children = currentNode["children"] || [];
				var nodeName = parts[j];
				var childNode;
				if (j + 1 < parts.length) {
					// Not yet at the end of the sequence; move down the tree.
					var foundChild = false;
					for (var k = 0; k < children.length; k++) {
						if (children[k]["name"] == nodeName) {
							childNode = children[k];
							foundChild = true;
							break;
						}
					}
					// If we don't already have a child node for this branch, create it.
					if (!foundChild) {
						childNode = {"name": nodeName, "children": []};
						children.push(childNode);
					}
					currentNode = childNode;
				} else {
					// Reached the end of the sequence; create a leaf node.
					childNode = {"name": nodeName, "size": size};
					children.push(childNode);
				}
			}
		}
		return root;
	}

	return Sunburst;
}));
