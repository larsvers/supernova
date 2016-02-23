// done in v22: 
// (1) detach guyana from france (dataprep())
// (2) final effect (finalTurn1(), finalTurn2(), supernova())
// (3) added animal tooltip
// (4) added score and stats modal


var log = console.log.bind(console);
var dir = console.dir.bind(console);

d3.selection.prototype.moveToFront = function() {
  return this.each(function(){
    this.parentNode.appendChild(this);
  });
}; //http://stackoverflow.com/questions/14167863/how-can-i-bring-a-circle-to-the-front-with-d3

var vis = vis || {};


/* data ---------------------------------------------------------------------------------------- */

queue()
	.defer(d3.json,'data/world.json')
	.defer(d3.tsv, 'data/animals.tsv')
	.defer(d3.tsv, 'data/countryTranslations.tsv')
	.await(dataprep); // load required datasets

function dataprep(err, worlddata, animaldata, countrytranslationdata) {

	if(err) { console.warn('error with queue() data loading'); }
	
	// save data as a window object to let every function have access to it http://stackoverflow.com/questions/9491885/csv-to-array-in-d3-js
	window.g = window.g || {};

	/* globals */

	// make data global
	g.mapdata = topojson.feature(worlddata, worlddata.objects.ne_110m_admin_0_countries); // controller init func needs to go in async data call
	g.animalDataOrig = animaldata;
	g.countrynameTranslations = countrytranslationdata;

	g.updateShortlist; // make function to pick element-data global
	g.shortlist; // make actual shortlist array global as it's getting changed when country was found

	// utility
	g.formatSep = d3.format(',');
	g.kolor = d3.scale.linear()
		.domain([0, Math.PI*.5, Math.PI]) // 2 * Pi = ~6.28 Radians, the longest possible distance from eg. 0,0 to 0,180
		.range(['#d7191c', '#abd9e9', '#2c7bb6']); // colour scale

	// map objects
	g.path; // make path generator with projection global
	g.project = {}; // make the projection global
	g.project.type = 'globe'; // 'globe' or 'flat'
	g.project.globe = d3.geo.orthographic();
	g.project.flat = d3.geo.robinson();
	g.scale; // make the scale global as it's used in vis.map.init and the zoom-functions
	g.bounds; // make the bounds global as it's used in vis.map.init and the projection setting function
	g.sphere; // make the sphere global as it's used in vis.map.init and the zoom-functions
	g.worldupdate // make worldupdate global as it's the the world-paths to be updated by all wordl-updating functons
	
	g.width = window.innerWidth;
	g.height = window.innerHeight;
	g.widthElem = g.width * .2; // unused in fact
	g.heightElem = g.height * .7; // used to control elements size
	g.heightFactor = .15; // used to control elements size

	// trackers, bouncers and limits
	g.geoToFind; // make global as used in various places
	g.itemToFind // make global as used for non-flag-items with more complex identifier (beyond just the three-letter country id). Set to the ID of the dragged element at dragstart, set to undefinde at dragend. Identifies the element that's currently being dragged to remove it from the shortlist when it is found. Not necessary for flags as they can be defined by the countries ID, but bitterly needed for the animals for example.
	g.findCentroid; // make global as used in dragstart and map-update
	g.mouseCentroid; // not really necessary to be global, yet better code readability
	
	g.shortlistBouncer = false; // make global as used in various places 
	g.zoomBouncer = false; // make global as used in various places
	g.reprojectBouncer = false;
	g.elementBouncer = 'flags'; // element button (flags or animals)
	g.lingoBouncer = 'English'; // language bouncer (needs to be capital)
	g.foundStyle = 'texture'; // styling bouncer for element search. options: texture (for texture.js) and mono (for single colour)
	
	g.zoomMinFlags = 100000; // not necessary to be global, yet top position allows easy change
	g.zoomMinAnimals = 5; // not necessary to be global, yet top position allows easy change
	g.elementsShown = 6; // not necessary to be global, yet top position allows easy change
	
	g.prevFlagpoints = 0; // flagpoints before respective flag found
	g.prevAnimalpoints = 0; // animalpoints before respective animal found
	g.prevTotalpoints = 0; // totalpoints before respective animal or flag found
	g.flagpoints = 0; // flagpoints counter
	g.animalpoints = 0; // animalpoints counter
	g.totalpoints = 0; // totalpoints counter
	g.totalFlagarea = 0; // total area counter
	
	// country and animalcounts further below
	
	g.flagpointsPerCountry = {}; // object keeping track of points per country
	g.animalpointsPerArea = {}; // object keeping track of points per animal
	
	g.searchtimeStart; // start of search (kicked off at dragstart)
	g.searchtimeEnd; // end of search (triggered when found)
	g.searchtime; // duration of search
	g.searchtimeFactor; // calculated multiplicator
	g.totalFlagSearchtime = 0; // total duration searched for flags
	g.totalAnimalSearchtime = 0; // total duration searched for animals
	g.totalSearchtime = 0; // total duration searched 
	
	g.touchstartX = 0; 
	g.touchleftX = 0; 
	g.touchdiffX = 0; 

	g.angle = 0; // I think this can go (check when finished)
	g.force; // make force global as it's used outside the supernova() function (check when finished, might not be necessary) 
	
	// Identifier lookup objects (attention: unused at the moment but possibly useful for continent- or region-mechanics)
	g.continentId = {
		'Asia': 'C_ASI',
		'Africa': 'C_AFR',
		'Europe': 'C_EUR',
		'South America': 'C_SAM',
		'Antarctica': 'C_ANT',
		'Seven seas (open ocean)': 'C_SES',
		'Oceania': 'C_OCE',
		'North America': 'C_NAM'
	};

	g.regionId = {
		'Southern Asia': 'R_SAS',
		'Middle Africa': 'R_MAF',
		'Southern Europe': 'R_SEU',
		'Western Asia': 'R_WAS',
		'South America': 'R_SAM',
		'Antarctica': 'R_ANT',
		'Seven seas (open ocean)': 'R_SES',
		'Australia and New Zealand': 'R_ANZ',
		'Western Europe': 'R_WEU',
		'Eastern Africa': 'R_EAF',
		'Western Africa': 'R_WAF',
		'Eastern Europe': 'R_EEU',
		'Caribbean': 'R_CAR',
		'Central America': 'R_CAM',
		'South-Eastern Asia': 'R_SEA',
		'Southern Africa': 'R_SAF',
		'Northern America': 'R_NAM',
		'Eastern Asia': 'R_EAS',
		'Northern Europe': 'R_NEU',
		'Northern Africa': 'R_NAF',
		'Melanesia': 'R_MEL',
		'Central Asia': 'R_CAS'
	};

	g.buttonLingoLookup = {
		setElementCategory: {
			flags: {
				English: 'animals',
				German: 'tiere'
			},
			animals: {
				English: 'flags',
				German: 'flaggen'
			}
		},
		setProjection: {
			globe: {
				English: 'flat',
				German: 'flach'
			},
			flat: {
				English: 'round',
				German: 'rund'
			}
		},
		lingo: {
			English: 'deutsch',
			German: 'english'
		},
		stats: {
			English: 'stats',
			German: 'zahlen'
		},
		supernova: {
			English: 'enough now',
			German: 'reicht jetzt'
		},
		supernovaConfirm: {
			question: {
				English: 'Sure ? Yes ?',
				German: 'Echt ?'
			},
			button: {
				yes: {
					English: 'yes',
					German: 'ja'
				},
				no: {
					English: 'no',
					German: 'nö'
				}
			}
		},
		points: {
			flags: {
				English: 'flags',
				German: 'flaggen'
			},
			animals: {
				English: 'animals',
				German: 'tiere'
			}
		}
	} // lookup for switching the language (note: button show the opposite option)

	g.tooltipGeneral = {
		populationBig: {
			English: ' milion people live here',
			German: ' Millionen Menschen leben hier'
		},
		populationSmall: {
			English: ' people live here',
			German: ' Menschen leben hier'
		},
		seperator: {
			English: ',',
			German: '.'
		},
		points: {
			English: ' points',
			German: ' Punkte'
		},
		size: {
			flags: {
				English: 'Size: ',
				German: 'Größe: '
			},
			animals: {
				English: 'roams in ',
				German: 'bevölkert '
			}
		},
		area: {
			English: ' percent of the world',
			German: ' Prozent der Welt'
		},
		duration: {
			English: 'Search time: ',
			German: 'Suchzeit: '
		},
		seconds: {
			singular: {
				English: ' second',
				German: ' Sekunde'
			},
			plural: {
				English: ' seconds',
				German: ' Sekunden'
			}
		},
		average: {
			English: 'Average: ',
			German: 'Durchschnitt: '
		},
		total: {
			English: 'Total: ',
			German: 'Insgesamt: '
		},
		foundAnimals: {
			singular: {
				English: ' animal found: ',
				German: ' Tier gefunden: '
			},
			plural: {
				English: ' animals already found: ',
				German: ' Tiere schon gefunden: '
			}
		},
		unfoundAnimals: {
			singular: {
				English: ' single animal needs to be found (rocking !): ',
				German: ' einziges Tier musst Du nur noch finden (tuut !): '
			},
			plural: {
				English: ' animals still to be found',
				German: ' Tiere noch zu finden'
			}
		},
		supernova: {
			explode: {
				English: 'click ...',
				German: 'klick ...'
			},
			remains: {
				English: 'I\'m still left',
				German: 'Ich bin noch hier'
			},
			resurrect: {
				English: 'Resurrection ?',
				German: 'Auferstehung ?',
			}
		}
		
	} // text for tooltip

	g.u; // the texture.js pattern variable
	
	g.twitchInterval; // interval in twitch() function

	// data manipulations
	g.mapdata.features.forEach(function(el){
		el.properties.nameEnglish = el.properties.name;
		g.countrynameTranslations.forEach(function(elt){
			if(elt['English'] === el.properties.name) el.properties.nameGerman = elt['German'];
		}); // add english and german country-names
		
		for(var key in el.properties){
			if (key !== 'adm0_a3' && key !== 'continent' && key !== 'name' && key !== 'nameEnglish' && key !== 'nameGerman' && key !== 'pop_est' && key !== 'subregion'){
				delete el.properties[key];
			} // if key isn't <list of used properties>
		} // delete unused properties
		
	}); // add countryname translations to the g.mapdata object

	// split french guiana off france
	var france = g.mapdata.features[55]; // get france
	var guianaCoords = france.geometry.coordinates.shift(); // remove the first array from France (which is Fr. Guiana) and store it in variable
	var guiana = {
		geometry: {
			coordinates: guianaCoords,
			type: 'Polygon'
		},
		properties: {
			adm0_a3: 'GUI',
			continent: 'South America',
			name: 'French Guiana',
			nameEnglish: 'French Guiana',
			nameGerman: 'Französisch Guiana',
			pop_est: 250109,
			subregion: 'South America'
		},
		type: 'Feature'
	} // build french guiana geojson object
	var l = g.mapdata.features.length;
	g.mapdata.features[l] = guiana; // add french guiana object to end of the g.mapdata features array

	log(g.mapdata);
	
	g.flagDataOrig = g.mapdata.features.map(function(d,i){
		return {
			indexO: i,
			nameEnglish: d.properties.nameEnglish,
			nameGerman: d.properties.nameGerman,
			id: d.properties.adm0_a3,
			continent: d.properties.continent,
			region: d.properties.subregion,
			cId: g.continentId[d.properties.continent],
			rId: g.regionId[d.properties.subregion]
		}
	}); // data for the elements

	var arr = [];
	g.flagDataOrig.forEach(function(el){
		arr.push(el.continent);
	})	

	// data: create a dataset for each element-category. This will decrease when elements are found
	g.flagData = _.cloneDeep(g.flagDataOrig);
	g.animalData = _.cloneDeep(g.animalDataOrig);

	// flag and animal count trackers
	g.flagsToFind = g.flagData.length;
	g.flagsFound = 0;
	g.animalsToFind = g.animalData.length;
	g.animalsFound = 0;
	
	g.updateShortlist	= function(){


		g.shortlist = [];

		switch(g.elementBouncer) {
			case 'flags':
				flags(); break;
			case 'animals':
				animals(); break;
			default: 
				console.error('g.elementBouncer issues')
		}

		function flags() {

			for (var i = 0; g.flagData.length < g.elementsShown ? i < g.flagData.length : i < g.elementsShown; i++){
				var l = g.flagData.length;
				var rand = Math.floor(Math.random() * l);
				g.shortlist.push(g.flagData[rand]);
				g.flagData.splice(rand,1)
			} // loop g.elementsShown times or g.flagData.length times if there are fewer elements than g.elementsShown left (otherwise shortlist would push empty elements into array which coulnd't be mapped in next step)

			g.shortlist = g.shortlist.map(function(d, i) {
				return {
					nameEnglish: d.nameEnglish,
					nameGerman: d.nameGerman,
					id: d.id,
					filename: 'flags/' + d.id,
					indexO: d.indexO, // probably not needed
					index: i, // probably not needed
					xo: 0, // original x-position for drag-end
					yo: ((g.heightElem * g.heightFactor) + 10) * i, // original y-position for drag-end
					found: 0
				}
			});
			
		}
		
		function animals() {
			
			for (var i = 0; g.animalData.length < g.elementsShown ? i < g.animalData.length : i < g.elementsShown; i++){
				var l = g.animalData.length;
				var rand = Math.floor(Math.random() * l);
				g.shortlist.push(g.animalData[rand]);
				g.animalData.splice(rand,1)
			} // loop g.elementsShown times or g.animalData.length times if there are fewer elements than g.elementsShown left (otherwise shortlist would push empty elements into array which coulnd't be mapped in next step)

			g.shortlist = g.shortlist.map(function(d, i) {
				return {
					nameGerman: d.nameGerman, // attention: logic to switch between languages
					nameEnglish: d.nameEnglish, // attention: logic to switch between languages
					country: d.country.split(', '),
					countryIds: d.country.replace(/^|\s/g, ' #'), // replace the beginning of the string and all white-spaces
					continent: d.continent,
					id: d.cleanAnimalName,
					filename: 'animals/' + d.cleanAnimalName,
					index: i, // probably not needed
					xo: 0, // original x-position for drag-end
					yo: ((g.heightElem * g.heightFactor) + 10) * i, // original y-position for drag-end
					found: 0,
					sorting: d.sorting
				}
			});
						
		}

		return g.shortlist;
		
	} // g.updateShortlist()

	g.touchDirXArray = []; // array to hold the x-positions to calculate the move-direction (replacing event.movementX not supported on touch devices)
	g.moveDirXArray = []; // array to hold the x-positions to calculate the move-direction (replacing event.movementX not supported on IE or Safari)

	// initialisation functions
	vis.map.init();
	vis.map.update();
	vis.elements.init();
	vis.elements.update(g.updateShortlist());
	// vis.collection.init() gets initialised in dragend when first element has been found;
	vis.points.init();


	// vis.stats.initContainer();

} // data and prep


/* map ----------------------------------------------------------------------------------------- */


vis.map = (function(){
	
	var world, worldmap;

	var my = {};
	
	my.svg = undefined; // make public
	
	my.init = function(){

		g.path = d3.geo.path().projection(g.project[g.project.type]);

	  g.project[g.project.type].scale(1).translate([0, 0]); // required to make the scale s below work

		g.bounds = g.path.bounds(g.mapdata);
		g.scale = Math.min(g.width / (g.bounds[1][0] - g.bounds[0][0]), g.height / (g.bounds[1][1] - g.bounds[0][1])) * .75;

		g.project[g.project.type]
			.scale(g.scale)
			.translate([g.width/2.75, g.height/2.5]);

		if (g.project.type === 'globe') {
			g.project[g.project.type]
				.scale(g.scale)
				.rotate([0,0,0])
				.clipAngle(90);
		}

		my.svg = d3.select('div#container')
			.append('svg')
			.attr("viewBox", "0 0 " + g.width + " " + g.height)
			.attr("preserveAspectRatio", "xMinYMax"); // svg with viewBox for responsiveness

		// textures

		g.u = textures.circles()
			.size(6)
			.background('#ccc')
			.complement()
			.fill('orange');
			
			// g.u = textures.lines().size(5).strokeWidth(2).stroke("#00CC00").background('#fff'); // line alternative

		// my.svg.call(g.t);
		my.svg.call(g.u);
		
		world = my.svg.append('g')
			.attr('class', 'boundary'); // g

		g.sphere = world.append('path')
			.datum({type: 'Sphere'})
			.attr('class', 'world')
			.attr('id', 'sphere')
			.attr('d', g.path)
			.attr('fill', 'url(#gradBlue)')
			.attr('filter', 'url(#glow)'); // globe outline
			
		world.append('rect')
			.attr('class', 'world')
			.attr('cx', 0)
			.attr('cy', 0)
			.attr('width', g.width)
			.attr('height', g.height); // rect under flat world to register move listeners on

	} // vis.map.init

	my.update = function(){

		worldmap = world.selectAll('.path')
			.data(g.mapdata.features); // join

		var worldenter = worldmap.enter(); // enter

		g.worldupdate = worldenter.append('path')
			.attr('d', g.path)
			.attr('class', function(d) { return 'world ' + g.continentId[d.properties.continent] + ' ' + g.regionId[d.properties.subregion] })
			.attr('id', function(d) { return d.properties.adm0_a3; }); // update

		d3.selectAll('.world').on('mouseover', mouseover); // mouseover listener
		d3.selectAll('.world').on('mousemove', mousemove); // mousemove listener
		d3.selectAll('.world').on('mouseout', mouseout); // mouseout listener

		d3.select('body').on('touchmove', touchmove); // touchmove listener (does pretty much all in one)
		d3.select('body').on('touchend', touchend); // touchmove listener (does pretty much all in one)



	} // vis.map.update

	return my;
	
})(); // vis.map
	


/* elements ------------------------------------------------------------------------------------ */


vis.elements = (function(){

	var elements; 

	var my = {};

	my.init = function(){

	elements = d3.select('div#container')
		.append('div')
		.attr('id', 'elements');
		
	}

	my.update = function(data){

		// data join
		var item = elements.selectAll('.item')
			.data(data);

		// enter selection (happens to every new element)
		item.enter()
			.append('div')
			.attr('class', 'item');

		// update selections
		item
			.classed('selected', false)
			.attr('id', function(d) { return d.id; })
			.style('top', function(d,i) { return (((g.heightElem * g.heightFactor) + 10) * i) + 'px'; }) // the y-position is a function of the height of the element, a size-controlling factor and 10 pixel for a bottom-margin defining the distance between the elements
			.style('left', '0px')
			.style('opacity', .8)
			.style('height', 1e-6 + 'px')
			.call(trans.appearingElementDiv, (g.heightElem * g.heightFactor * .6)); // staggered entrance with delay(), transition to normal font-size
	
		item.append('div')
			.attr('class', 'subitem')
			.attr('id', function(d) { return d.id; })
			.html(function(d) { return d[('name' + g.lingoBouncer)]; })
			.style('font-size', function(d) { return 1e-6 + 'px'})
			.call(trans.appearingElementText, (g.heightElem * g.heightFactor * .15)); // staggered entrance with delay(), transition to normal font-size

		item.append('img')
			.attr('class', 'subitem')
			.attr('id', function(d) { return d.id; })
			.attr('src', function(d) { return 'images/' + d.filename + '.png'; })
			.style('height', '100%')
			.style('margin', 0);
		
		item.exit().remove();

		// initiate drag
		var drag = d3.behavior.drag()
			.on('dragstart', my.dragstart)
			.on('drag', my.dragmove)
			.on('dragend', my.dragend);

		// add drag to the country name
		d3.selectAll('.item')
			.call(drag);

	}
		
	// create one collectionArry for each element category (otherwise flags and animals end up in both collection divs. and dogs will sleep with cats)
	var collectionArrayFlags = [];
	var collectionArrayAnimals = [];
	
	// initiate drag-function
	my.dragstart = function(d) {
		
		g.itemToFind = d3.select(this).attr('id'); // set id of item to find
	
		d3.select('div#' + g.itemToFind).call(trans.dragstartMoveElementInPosition); // move country div into position after dragstart

		if(g.elementBouncer === 'flags') {

			g.geoToFind = d.id; // set geoToFind variable to country to find

			g.findCentroid = d3.geo.centroid(d3.select('path#' + g.itemToFind).data()[0]); // calculate centroid of country to find
			
		} else if(g.elementBouncer === 'animals') {

			g.geoToFind = d.country // set geoToFind variable to be the array of countries to find
			
			if(g.geoToFind.length === 1) {

				g.findCentroid = d3.geo.centroid(d3.select('path#' + g.geoToFind[0]).data()[0]); // calculate centroid of country to find
				
			} else if(g.geoToFind.length > 1 && g.geoToFind.length < 70) {
				
				var geoForCentroidCalc = [];
				var i = Math.floor(Math.random() * g.geoToFind.length);
				geoForCentroidCalc.push(g.geoToFind[i]);
				
				g.findCentroid = d3.geo.centroid(d3.select('path#' + geoForCentroidCalc[0]).data()[0]); // calculate centroid of country to find

			} // distinguish between finding a single country and an area
			
		} // calculate g.findCentroid - the centroid of the country/area to find

		if(g.elementBouncer === 'flags' && g.project.type === 'flat') {

			// zoom and pan upon dragstart (if bounding box area is smaller than the chosen minimum area in pixel to start the zoom)
			var areaBoundingBox = d3.select('path#' + g.itemToFind)[0][0].getBBox().width * d3.select('path#' + g.itemToFind)[0][0].getBBox().height;

			if (areaBoundingBox < g.zoomMinFlags) g.zoomBouncer = true;

		} else if (g.elementBouncer === 'animals' && g.project.type === 'flat') {

			if(g.geoToFind.length < g.zoomMinAnimals) g.zoomBouncer = true;
			
		} else {
			
			g.zoomBouncer = true
			
		} // area size of countries to find for flags and number of countries to find for animals decides about zoom or not zoom when projected flat.
		
		getPoints('start'); // kick-start flag point calculation

	} // dragstart

	my.dragmove = function(d) {

		// move element-div
		d3.select(this)
			.style('left', (d3.event.x) + 'px')
			.style('top', (d3.event.y) + 'px');
	} // dragmove

	my.dragend = function(d) {

		if(d.found) {
				
			if(d3.select('div#collection').empty()) { vis.collection.init(); };
			
			// move element into collection
			d3.select(this).call(trans.dragendMoveElementToCollection); 

			if(d.filename.substr(0,3) === 'fla') {
				collectionArrayFlags.push(d);
				vis.collection.update(collectionArrayFlags);
			} else if(d.filename.substr(0,3) === 'ani') {
				collectionArrayAnimals.push(d);
				vis.collection.update(collectionArrayAnimals);
			} // fill collectionArrays by element category and update collection module accordingly

		} else {

			// move element back into original position (note that you need to change .xo and .yo in 2 lines in this code)
			d3.select(this).call(trans.dragendMoveElementBack, d); // moves it back based on d.xo and d.yo, d to be passed to named transition

		} // checks if the element's property 'found' has received a value of 1 (found) or not (0 - not found)

		
		if(g.shortlistBouncer){
			
			setTimeout(function() {
				d3.selectAll('.subitem').remove();
				
				my.update(g.updateShortlist());
				d3.selectAll('.item').classed('selected', false);
				g.shortlistBouncer = false;
			},1000);

		} // if all elements have been found, clear all elements 

		g.geoToFind = undefined;
		g.itemToFind = undefined; // attention: moved out of above function as it made more sense to empty at each dragend. might break something?

		if(g.reprojectBouncer === false) setOriginalMapState(50); // re-colour and reproject but only if it's not currently recolouring /-projecting (can happen if country found or at dragend)

	} // dragend

	return my;


})(); // vis.elements



/* collection ------------------------------------------------------------------------------------ */


vis.collection = (function(){

	var collection; 

	var my = {};

	my.init = function(){

	collection = d3.select('div#container')
		.append('div')
		.attr('id', 'collection');
	
	collection
		.style('background', 'rgba(255, 255, 255, 0)')
		.transition()
		.style('background', 'rgba(255, 255, 255, 0.2)');
	
	collection.append('div')
		.attr('id', 'gradientFade'); // div for collection item fade effect
	
	collection
		.append('div')
		.attr('class', 'subcollection')
		.attr('id', 'flagsCollection');
	
	collection
		.append('div')
		.attr('class', 'subcollection')
		.attr('id', 'animalsCollection');
				
	} // vis.collection.init

	my.update = function(data){

		// data join and enter
		var piece = d3.select('div#' + g.elementBouncer + 'Collection')
			.selectAll('.piece')
			.data(data)
			.enter()
			.insert('div', ':first-child') // insert the new element before everything else - simple use of css-pseudos
				.attr('class', 'piece');

		// update selections
		piece
				.classed('selected', false)
				.attr('id', function(d) { return d.id; });

		piece.append('img')
				.attr('class', 'subpiece')
				.attr('id', function(d) { return d.id; })
				.attr('src', function(d) { return 'images/' + d.filename + '.png' })
				.style('height', 0)
				.call(trans.heightImage, (g.heightElem * g.heightFactor * .35) + 'px');
				// .call(trans.heightImage, heightLookup[g.elementBouncer]);

		piece.append('div')
				.attr('class', 'subpiece')
				.attr('id', function(d) { return d.id; })
				.html(function(d) { return d[('name' + g.lingoBouncer)]; })
				.style('font-size', 0)
				.call(trans.fontSizeImg,(g.heightElem * g.heightFactor * .125) + 'px');

		// listeners for collection pieces (need to be inside update sub-module)

		d3.selectAll('.subpiece').on('mouseover', function(){

			var id = d3.select(this).attr('id');

			d3.selectAll('.subpiece#' + id).transition().style('opacity', 1);
			
			if(d3.select(this).data()[0].filename.substr(0,3) === 'ani') {

				var animalInfo = d3.select(this);
				showAnimalTooltip(animalInfo); 

			} // only if we're hovering over an animal (and not a flag)

		}); // increase opacity of collected items during hover 

		d3.selectAll('.subpiece').on('mousemove', function(){

			var coords = getAnimalTipCoords();

			d3.select('div.tooltip')
				.style('top', coords.y + 'px')
				.style('left', coords.x + 'px'); // move tooltip with mouse

		}); // move tooltip along mousemove

		d3.selectAll('.subpiece').on('mouseout', function(){

			var id = d3.select(this).attr('id');

			d3.select('div.subpiece#' + id).transition().style('opacity', .6);
			d3.select('img.subpiece#' + id).transition().style('opacity', .4);
			
			d3.selectAll('div.tooltip').transition().style('opacity', 0); // fade out animal tooltip

		}); // decrease opacity of collected items during hover 

		d3.selectAll('.subpiece').on('mousedown', function(d){

			if (d.filename.substr(0,3) === 'fla'){
				
				d3.select('path#' + d.id).moveToFront(); // move path svg to end of the g element in the DOM, to sort out it's 'z-indez'

				var countryLong = d3.geo.centroid(d3.select('path#' + d.id).data()[0])[0]; // get longitude of country to focus
				var currentProjLong = g.project[g.project.type].rotate()[0]; // get the current projection longitude (which is the distance in longitude degrees from the prime meridian at greenwich)
				if (currentProjLong >= 0 && currentProjLong < 180) {
					
					var currentLong = -currentProjLong;
					
				} else if (currentProjLong >= 180 && currentProjLong < 360) {

					var currentLong = 360 - currentProjLong;

				} else if (currentProjLong >= -180 && currentProjLong < 0) {

					var currentLong = -currentProjLong;

				} else if (currentProjLong >= -360 && currentProjLong < -180) {

					var currentLong = -360 - currentProjLong;

				} // the current longitude can go from -360 to +360 depedning on how the world has been panned (if panned nearly all the way west we're at +359, as we have to move 359 degrees east, if panned nearly all the way east we're at -359 as we have to go 359 degrees west to get to teh prime meridian at 0). these conditions scale the domain to -180 to +180)
				var dist = currentLong - countryLong; // get the distance it takes to get from the current longitude to the country's longitude we want to get to

				function debugTurn(){
					log('current non scaled: ', currentProjLong);
					log('current rescaled: ', currentLong);
					log('countryLong: ', countryLong);
					log('distance: ', dist);
					log('direction: ', direction);
				} // 'drawer' function that keeps the log()'s to debug any turn() related issues

				if (g.project.type === 'globe'){
					turn(dist, d); // turn the world to respective country then trigger highlight
				} else if (g.project.type === 'flat'){
					highlightCountry(d); // just trigger highlight
				}

			} // highlight country by collected flag


			if (d.filename.substr(0,3) === 'ani'){

				var save = g.elementBouncer; // save g.elementBouncer state
				g.elementBouncer = 'animals'; // change to g.ElementBouncer, so that setOriginalMapState() routine for animal-elements runs
			
				d3.selectAll(d.countryIds)
					.classed('foundanimals', true)
					.style('fill', g.u.url()); // found animal algorithm 1: pattern - no colouring. decolouring by setOriginalMapState()
			
				playFoundSound('animals', d.id); // play found sound (param 1: category, param 2: filename)
			
				if (g.project.type === 'globe') turn();
			
				if (g.reprojectBouncer === false) setOriginalMapState(); // re-colour and reproject but only if its not currently recolouring /-projecting (can happen if country found or at dragend)

				g.elementBouncer = save; // change back to original g.elementBouncer state
				
			} // highlight animal range by collected animal
			
		}); // mousedown on collection piece, triggers actions on map


		d3.selectAll('.subcollection').on('touchstart', function(){
		
			g.touchstartX = d3.event.touches[0].pageX; // get x position of touchstart

			g.touchleftX = d3.select(this).style('left');
			g.touchleftX === 'auto' ? g.touchleftX = 0 : g.touchleftX = +g.touchleftX.substring(0, g.touchleftX.length - 2); // get 'position: left' of .subcollection div and type-convert it from string to number

		}); // touchstart on collection. gathers paramaters for calculating scroll
		
		d3.selectAll('.subcollection').on('touchmove', function(){

			var currentX = d3.event.touches[0].pageX; // continuously get x position of finger
			g.touchdiffX = g.touchleftX + (currentX - g.touchstartX); // calculate the 'position: left' of the .subcolletion div

			d3.select(this)
				.style('left', g.touchdiffX + 'px'); // continuously update the left position 

			
		}); // touchmove on collection. implements scrolling

		d3.selectAll('.subcollection').on('touchend', function(){

			if (g.touchdiffX > 0) {

				d3.select(this)
					.transition()
					.style('left', '0px');

			} else {
				
				d3.select(this)
					.transition()
					.delay(5000)
					.style('left', '0px');
					
			} // snap the respective subcolletion back to 'left: 0px' immediatley if pulled to the right and after a delay if pushed to the left 
			
		}); // touchend on collection. snaps the collection div back into position

		
		

	} // vis.collection.update
	
	return my;

})(); // vis.collection



/* points ---------------------------------------------------------------------------------------- */


vis.points = (function(){

	var svgFlagpoints, svgAnimalpoints;

	var my = {};
	
	my.init = function(){
		
	/* set up the increasing point count  (..to be continued when elements found) */
		
	svgTotalpoints = d3.select('div#totalpoints')
		.append('svg')
		.attr('width', '5.2em')
		.attr('height', '1.2em')
		// .style('border', '1px solid black')
		.style('text-anchor', 'end'); // set up the svg for the flag point count

	svgTotalpoints.append('text')
		.attr('x', '5em')
		.attr('y', '.9em')
		.text(0)
		.style('fill', '#555'); // add the initial animal number
		

	svgFlagpoints = d3.select('div#flagpoints')
		.append('svg')
		.attr('width', '5.2em')
		.attr('height', '1.2em')
		.style('text-anchor', 'end'); // set up the svg for the flag point count

	svgFlagpoints.append('text')
		.attr('x', '5em')
		.attr('y', '.9em')
		.text(0)
		.style('fill', '#555'); // add the initial animal number
		

	svgAnimalpoints = d3.select('div#animalpoints')
		.append('svg')
		.attr('width', '5.2em')
		.attr('height', '1.2em')
		// .style('border', '1px solid black')
		.style('text-anchor', 'end'); // set up the svg for the animal count

	svgAnimalpoints.append('text')
		.attr('x', '5em')
		.attr('y', '.9em')
		.text(0)
		.style('fill', '#555'); // add the initial animal number
		
		
	} // vis.points.init

	my.updateTotal = function(){
		
		d3.select('div#totalpoints > svg > text').remove(); // remove all previous point numbers on the svg

		svgTotalpoints.selectAll('.txt')
			.data([g.totalpoints])
			.enter()
			.append('text')
			// .text(g.prevFlagpoints + g.previousAnimalpoints)
			.text(g.prevTotalpoints)
			.attr('x', '5em')
			.attr('y', '.9em')
			.style('fill', '#555')
			.transition()
			.duration(2000)
			.tween('text', function(d) {
				var i = d3.interpolate(this.textContent, d);
				return function(t) {
					this.textContent = Math.round(i(t));
				};
			}); // count up to new number of flag points
			
	} // vis.points.updateTotal

	my.updateFlags = function(){
		
		d3.select('div#flagpoints > svg > text').remove(); // remove all previous point numbers on the svg

		svgFlagpoints.selectAll('.txt')
			.data([g.flagpoints])
			.enter()
			.append('text')
			.text(g.prevFlagpoints)
			.attr('x', '5em')
			.attr('y', '.9em')
			.style('fill', '#555')
			.transition()
			.duration(2000)
			.tween('text', function(d) {
				var i = d3.interpolate(this.textContent, d);
				return function(t) {
					this.textContent = Math.round(i(t));
				};
			}); // count up to new number of flag points
			
		d3.select('div#flagcount > span.points')
			.html(g.flagsFound); // change the flagcount

	} // vis.points.updateFlags

	my.updateAnimals = function(){
		
		d3.select('div#animalpoints > svg > text').remove(); // remove all previous point numbers on the svg

		svgAnimalpoints.selectAll('.txt')
			.data([g.animalpoints])
			.enter()
			.append('text')
			.text(g.prevAnimalpoints)
			.attr('x', '5em')
			.attr('y', '.9em')
			.style('fill', '#555')
			.transition()
			.duration(2000)
			.tween('text', function(d) {
				var i = d3.interpolate(this.textContent, d);
				return function(t) {
					this.textContent = Math.round(i(t));
				};
			}); // count up to new number of animal points

		d3.select('div#animalcount > span.points')
			.html(g.animalsFound); // change the animal count
		
	} // vis.points.updateAnimals
	
	return my;
	
})(); // vis.points



/* stat board ------------------------------------------------------------------------------------ */


vis.stats = (function(){
	
	var my = {};

	// vars accessible in all vis.stats()
	var svg, defs, width, height, margin, n, accHeight, currHeight;
	var metric = 'time'; // specify metric to display ('points' or 'time')
	var offset = 50; // offset for lines
	var data = {}, xScale = {};
	var lines = {}, label = {}, result = {}, circles = {}, icons = {}, avgScores = {}, totalScores = {};
	
	// utility functions
	function textPrep(data, detail) {
		var prep; 

		if(detail === true) {
			if (metric === 'points') {
				prep = g.formatSep(data[metric]) + ' ' + g.tooltipGeneral.points[g.lingoBouncer];
			} else if (metric === 'time') {
				prep = data[metric] + ' ' + g.tooltipGeneral.seconds.plural[g.lingoBouncer];
			} // prepare the long result text version
		} else {
			if (metric === 'points') {
				prep = g.formatSep(data[metric]);
			} else if (metric === 'time') {
				prep = data[metric];
			} // prepare the short result text version
		} // decide if long result text (saying 'seconds' and 'points') or a short text

		return prep;
	} // prepare text for results text

	function setSvgOverflowHeight(id) {
		var accHeight = margin.top + n*offset + offset/2 + offset + 15; // accumulated height of all elements: (1) top margin (2) all elements (3) half of the element for the last one (4) one more offset and a bit for the average and total values
		var currHeight = d3.select('svg.svgStats.' + id).style('height'); // this returns a string with px at the end (remove the px)
		currHeight = +currHeight.slice(0, -2); // current height of SVG

		if (accHeight > currHeight) {
			d3.select('svg.svgStats.' + id).attr('height', accHeight);
		} // set svg height when necessary
	} // set svg width according to the height of all elements accumulated in order to introduce only the overflow necessary


	my.initContainer = function(){

		var statsInitHTML =
			'<div id="statsContainer">\
				<nav id="statsNav">\
					<button class="statsBtn" id="time">Zeit</button>\
					<button class="statsBtn" id="points">Punkte</button>\
					<div class="totalStats" id="total"></div>\
					<img class="statsBtn" id="close" src="images/other/close.png" alt="close"></img>\
				</nav>\
				<div id="statsWrapper">\
					<div class="graph flags">\
						<svg class="svgStats flags"></svg>\
					</div>\
					<div class="graph animals">\
						<svg class="svgStats animals"></svg>\
					</div>\
				</div>\
			</div>'

		d3.select('body')
			.append('div')
			.attr('id', 'statistics')
			.html(statsInitHTML);
			
		d3.select('div#statistics')
			.transition()
			.duration(100)
			.style('background-color', 'rgba(255, 165, 0, .6)');

		d3.select('div#container')
			.style('-webkit-filter', 'blur(20px)')
			.style('filter', 'blur(20px)');
		

		// d3 margin convention: http://bl.ocks.org/mbostock/3019563

		margin = { top: 40, right: 30, bottom: 20, left: 70 }; // set the margins for the graph
		
		width = document.querySelector('svg.svgStats').clientWidth;
		height = document.querySelector('svg.svgStats').clientHeight;
		// height = 1000;
		width = width - margin.left - margin.right;
		height = height - margin.top - margin.bottom; // width and height decided by the space available and subtract the margins. width and height means graph-width/height not svg-width/height

		d3.select('img#close').on('mouseover', function(){

			d3.select('img#close').style('opacity', 1);

		}); // stand out

		d3.select('img#close').on('mouseout', function(){

			d3.select('img#close').style('opacity', .7);

		}); // stand back
		
		d3.select('img#close').on('mousedown', function(){

			var time = 100;

			d3.select('div#container')
				.style('-webkit-filter', null)
				.style('filter', null); // remove blur

			d3.select('div#statistics').transition().duration(time).style('opacity', 0);
			d3.select('div#statistics').transition().delay(time).remove();

		}); // close the statistics modal needs to be inside the scope the elements got created in
		
		my.initGraph('flags'); // initiate the graph
		my.initGraph('animals'); // initiate the graph
		
	} // vis.stats.initContainer()
	
	my.initGraph = function(graphId){
		
		
		/* data and prep */ 

		data[graphId] = []; // data prep
	
		if(graphId === 'flags'){
			var dataset = 'flagpointsPerCountry';
			var dataOrig = 'flagDataOrig'
		} else if (graphId === 'animals'){
			var dataset = 'animalpointsPerArea';
			var dataOrig = 'animalDataOrig'
		} // to make following data function generic

		for (var key in g[dataset]){
			if (g[dataset].hasOwnProperty(key)){
				var obj = {};
				obj.id = key;
				obj.points = g[dataset][key].points;
				obj.time = g[dataset][key].time;
				g[dataOrig].forEach(function(el){
					if (key === el.cleanAnimalName || key === el.id) {
						obj.nameEnglish = el.nameEnglish;
						obj.nameGerman = el.nameGerman;
					}
				});
				data[graphId].push(obj);
			} // enumerable property check
		} // loop through each element in found items
			
		data[graphId].sort(function(a,b){
			if(metric === 'time'){
				return a.time - b.time;
			} else if(metric === 'points'){
				return b.points - a.points;
			} // ! never use retrun if() if else() always use if() then return if else () then return ! took me an hour of my life ...
		}); // sort data according to the specified metric

		n = data[graphId].length;

		if (d3.select('div.totalStats#total').html() === '') {
			
			var totalText;
			if (n > 0) {
				totalText = g.tooltipGeneral.total[g.lingoBouncer] + g.formatSep(g.totalpoints) + ' ' + g.tooltipGeneral.points[g.lingoBouncer] + ' | ' + g.totalSearchtime.toFixed(2) + ' ' + g.tooltipGeneral.seconds.plural[g.lingoBouncer];
			} else {
				totalText = '';
			} // generate text for average and total values

			d3.select('div.totalStats#total').html(totalText);
			
		}; // add total points and search time into the header


		/* set-up graph */ 

		svg = d3.select('svg.svgStats.' + graphId)
			.append('g')
			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')'); // var svg means graph not full svg
	
		xScale[graphId] = d3.scale.linear()
			.range([0, width])
			.domain([0, d3.max(data[graphId], function(d) { return d[metric]; })]); // linear scale bars

		lines[graphId] = svg.selectAll('.lines')
			.data(data[graphId])
			.enter()
			.append('line')
			.classed(graphId + 'Lines', true)
			.attr('x1', 0)
			.attr('y1', function(d,i) { return i * offset; })
			.attr('x2', 0)
			.attr('y2', function(d,i) { return i * offset; })
			.style('stroke-width', '2px')
			.style('stroke', 'darkorange'); // enter lines

		lines[graphId]
			.transition()
			.delay(function(d,i){ return i * 250 / n; })
			.attr('x2', function(d) { return xScale[graphId](d[metric]); })

			
		label[graphId] = svg.selectAll('.labels')
			.data(data[graphId])
			.enter()
			.append('text')
			.classed(graphId + 'Labels', true) // enter
			.attr('x', 0)
			.attr('y', function(d,i){ return i * offset - 6; })
			.text(function(d,i){ return d['name' + g.lingoBouncer]; })
			.style('font-size', '.3em'); // enter text labels

		result[graphId] = svg.selectAll('.results')
			.data(data[graphId])
			.enter()
			.append('text')
			.classed(graphId + 'Results', true) // enter
			.attr('x', 0)
			.attr('y', function(d,i){ return i * offset + 12; })
			.text(function(d){ return textPrep(d, true); }) // helper function to be found above in vis.stats() scope
			.style('font-size', '.3em'); // enter text labels

		circles[graphId] = svg.selectAll('.circles')
			.data(data[graphId])
			.enter()
			.append('circle')
			.classed(graphId + 'Circles', true)
			.attr('cx', 0)
			.attr('cy', function(d,i){ return i * offset; })
			.attr('r', 3)
			.style('fill', 'darkorange'); // enter lollipop circles

		circles[graphId]
			.transition()
			.delay(function(d,i){ return i * 250 / n; })
			.attr('cx', function(d){ return xScale[graphId](d[metric]); })

		var defs = svg.append('defs'); // define defs element (within svg.g element)

		data[graphId].forEach(function(el){
			defs	
				.append('pattern')
					.attr('id', el.id)
					.attr('x', 0)
					.attr('y', 0)
					.attr('width', 1)
					.attr('height', 1)
				.append('image')
					.attr('xlink:href', 'images/' + graphId + '/' + el.id + '.png')
					.attr('width', 30)
					.attr('height', 30); // these need to be double the filled circle's radius
					
		}); // attach an SVG pattern per found element to use as svg background (http://www.w3.org/TR/SVG/pservers.html#Patterns)

		icons[graphId] = svg.selectAll('.icons')
			.data(data[graphId])
			.enter()
			.append('circle')
			.classed(graphId + 'Icons', true)
			.attr('cx', -30 )
			.attr('cy', function(d,i){ return i * offset; })
			.attr('r', 15) // this one needs to be half the pattern > image's width and height to work
			.attr('fill', function(d){ return 'url(#' + d.id + ')'; })
			.style('stroke', 'darkorange')
			.style('stroke-width', '3px');


		var avgPointsInCategory = Math.round(d3.mean(data[graphId], function(d){ return d.points; }));
		var avgTimeInCategory = d3.mean(data[graphId], function(d){ return d.time; });

		var totalPointsInCategory = Math.round(d3.sum(data[graphId], function(d){ return d.points; }));
		var totalTimeInCategory = d3.sum(data[graphId], function(d){ return d.time; }); // calculate average and total metrics per category

		var avgTextCategory, totalTextCategory;
		if (n > 0) {
			avgTextCategory = g.tooltipGeneral.average[g.lingoBouncer] + g.formatSep(avgPointsInCategory) + ' ' + g.tooltipGeneral.points[g.lingoBouncer] + ' | ' + avgTimeInCategory.toFixed(2) + ' ' + g.tooltipGeneral.seconds.plural[g.lingoBouncer];
			totalTextCategory = g.tooltipGeneral.total[g.lingoBouncer] + g.formatSep(totalPointsInCategory) + ' ' + g.tooltipGeneral.points[g.lingoBouncer] + ' | ' + totalTimeInCategory.toFixed(2) + ' ' + g.tooltipGeneral.seconds.plural[g.lingoBouncer];
		} else {
			avgTextCategory = '';
			totalTextCategory = '';
		} // generate text for average and total values

		avgScores[graphId] = svg.append('text')
			.classed(graphId + 'Averages', true)
			.attr('x', 0)
			.attr('y', n * offset) // put one offset below the last lollipop (which has a y position of i * offset -> which will always be one behind n * offset)
			.text(avgTextCategory)
			.style('font-size', '.3em'); // add the average scores. this doesn't need to get updated

		totalScores[graphId] = svg.append('text')
			.classed(graphId + 'Totals', true)
			.attr('x', 0)
			.attr('y', n * offset + 15) // offset a little more than the average scores
			.text(totalTextCategory)
			.style('font-size', '.3em'); // add the average scores. this doesn't need to get updated


		setSvgOverflowHeight(graphId); // function extends svg height to height of all elements if overflow necessary. CSS overflow on the wrapper div then only allows truly necessary overflow
		

		/* listeners and handlers toggle stat-metric */ 
		
		d3.select('button.statsBtn#' + metric).style('background-image', 'url(images/other/zoombutton.png)'); // initial button state
		
		d3.select('button.statsBtn#points').on('mousedown', function(){

			metric = 'points'
			
			d3.selectAll('button.statsBtn').style('background-image', 'none');
			d3.select(this).style('background-image', 'url(images/other/zoombutton.png)'); // change buttons

			my.update('flags'); // call the update func
			my.update('animals'); // call the update func

		}); // change metric event

		d3.select('button.statsBtn#time').on('mousedown', function(){

			metric = 'time'

			d3.selectAll('button.statsBtn').style('background-image', 'none');
			d3.select(this).style('background-image', 'url(images/other/zoombutton.png)'); // change buttons

			my.update('flags'); // call the update func
			my.update('animals'); // call the update func

		}); // change metric event

		
	} // vis.stats.initGraph()

	my.update = function(graphId){
		

		data[graphId].sort(function(a,b){
			if(metric === 'time'){
				return a.time - b.time;
			} else if(metric === 'points'){
				return b.points - a.points;
			} // ! never use retrun if() if else() always use if() then return if else () then return ! took me an hour of my life ...
		}); // sort data according to the specified metric

		n = data[graphId].length;
		var dur = 500;
				
		xScale[graphId] = d3.scale.linear()
			.range([0, width])
			.domain([0, d3.max(data[graphId], function(d){ return d[metric]; })]); // linear scale bars

		lines[graphId]
			.data(data[graphId], function(d){ return d.nameEnglish; }) // bloody remember to re-join the data ! and add a key function for object constancy (http://bost.ocks.org/mike/constancy/)
			.transition().duration(dur).delay(function(d,i){ return i / n * dur; })
			.attr('y1', function(d,i){ return i * offset; })
			.attr('x2', function(d){ return xScale[graphId](d[metric]); })
			.attr('y2', function(d,i){ return i * offset; }); // update lines

		label[graphId]
			.data(data[graphId], function(d){ return d.nameEnglish; })
			.transition().duration(dur).delay(function(d,i){ return i / n * dur; })
			.attr('y', function(d,i){ return i * offset - 6; })
			.text(function(d,i){ return d['name' + g.lingoBouncer]; }); // update labels (element name)
		
		result[graphId]
			.data(data[graphId], function(d){ return d.nameEnglish; })
			.transition().duration(dur).delay(function(d,i){ return i / n * dur; })
			.attr('y', function(d,i){ return i * offset + 12; })
			.text(function(d){ return textPrep(d, true); }); // update stats
		
		circles[graphId]
			.data(data[graphId], function(d){ return d.nameEnglish; })
			.transition().duration(dur).delay(function(d,i){ return i / n * dur; })
			.attr('cx', function(d){ return xScale[graphId](d[metric]); })
			.attr('cy', function(d,i){ return i * offset; }); // update lollipop line ends

		icons[graphId]
			.data(data[graphId], function(d){ return d.nameEnglish; })
			.transition().duration(dur).delay(function(d,i){ return i / n * dur; })
			.attr('cy', function(d,i){ return i * offset; })
			.attr('fill', function(d){ return 'url(#' + d.id + ')'; }); // update picture
		
		
	} // vis.stats.updateGraph()
	
	return my;
	
})(); // vis.stats 



/* control button listeners -------------------------------------------------------------------- */


d3.select('button#setElementCategory').on('mousedown', function(){

	// move the unfound element objects back to the original array
	// first subtract collected data from element array, then push them back into the original data array
 
	var collectionData = d3.selectAll('div.piece').data(); // data in collection (only found)
	var elementData = d3.selectAll('div.item').data();	 // data in elements (all)
	
	var foundElementsId = [];
	collectionData.forEach(function(el){
		foundElementsId.push(el.id);
	}); // create array with found id's (includes all objects in collection)
	
	var unfoundElementsId = [];
	elementData.forEach(function(el){
		if(foundElementsId.indexOf(el.id) === -1) {
			unfoundElementsId.push(el.id);
		};
	}); // create array of non-found element id's
	
	if(g.elementBouncer === 'animals') {

		var unfoundElements = g.animalDataOrig.filter(function(el){
			return unfoundElementsId.indexOf(el.cleanAnimalName) > -1;
		}); // create array of non-found element objects

		unfoundElements.forEach(function(el){
			g.animalData.push(el);
		}); // push the non-found elements back into the animal data set
		
	} // push non-found animals back
	
	if(g.elementBouncer === 'flags') {

		var unfoundElements = g.flagDataOrig.filter(function(el){
			return unfoundElementsId.indexOf(el.id) > -1;
		}); // create array of non-found element objects

		unfoundElements.forEach(function(el){
			g.flagData.push(el);
		}); // push the non-found elements back into the flag data set
		
	} // push non-found flags back
	
	d3.selectAll('div.item').remove();
		
	if(d3.select(this).html() === 'flaggen' || d3.select(this).html() === 'flags'){

		g.elementBouncer = 'flags';
		d3.select(this).html(g.buttonLingoLookup.setElementCategory[g.elementBouncer][g.lingoBouncer]);

	} else if(d3.select(this).html() === 'tiere' || d3.select(this).html() === 'animals'){

		g.elementBouncer = 'animals';
		d3.select(this).html(g.buttonLingoLookup.setElementCategory[g.elementBouncer][g.lingoBouncer]);

	} // changing the button text		

	vis.elements.update(g.updateShortlist());
	
}); // set element category (flags, animals)

d3.select('button#setProjection').on('mousedown', setProjection);

var zoomActive = false; // for toggling the button-style

d3.select('button#zoom').on('mousedown', function(){

	zoomActive = !zoomActive; // toggle var for button background

	d3.select(this).style('background-image', zoomActive ? 'url(images/other/zoombutton.png)' : 'none'); // toggle an orange background image on and off as background- and font-colour would overwrite the :hover settings
	
	g.zoomBouncer === true ? g.zoomBouncer = false : g.zoomBouncer = true; // toggle zoom on and off

	if(g.zoomBouncer === false) setOriginalMapState(10); // when toggling it off, secure a quick centering of the world

}); // toggle zoom and turn

d3.select('button#lingo').on('mousedown', function(){

	g.lingoBouncer = g.lingoBouncer === 'English' ? 'German' : 'English'; // set language

	d3.selectAll('div.subitem').html(function(d) { return d[('name' + g.lingoBouncer)]; }); // update element text
	d3.selectAll('div.subpiece').html(function(d) { return d[('name' + g.lingoBouncer)]; }); // update collection text
	
	d3.select('button#setElementCategory').html(g.buttonLingoLookup.setElementCategory[g.elementBouncer][g.lingoBouncer]); // update category button
	d3.select('button#setProjection').html(g.buttonLingoLookup.setProjection[g.project.type][g.lingoBouncer]); // update projection button

	d3.select('button#supernova').html(g.buttonLingoLookup.supernova[g.lingoBouncer]); // update supernova button
	d3.select('button#lingo').html(g.buttonLingoLookup.lingo[g.lingoBouncer]); // update language button
	d3.select('button#stats').html(g.buttonLingoLookup.stats[g.lingoBouncer]); // update supernova button

	d3.select('div#flaglabel').html(g.buttonLingoLookup.points.flags[g.lingoBouncer]);
	d3.select('div#animallabel').html(g.buttonLingoLookup.points.animals[g.lingoBouncer]); // update point labels	
	

}); // toggle between languages

d3.select('button#supernova').on('mousedown', function(){

	if (g.project.type === 'flat') { 
		var wasFlat = true;
		setProjection(); 
	} // change to globe as supernova only really works with the globe
	
	d3.select('div#confirmEnd').remove(); // remove potential duplicates

	d3.select('body')
		.append('div')
		.attr('id', 'confirmEnd')
		.html(g.buttonLingoLookup.supernovaConfirm.question[g.lingoBouncer])
		.transition()
		.style('opacity', .9); // create alert box

	d3.select('div#confirmEnd')
		.append('div')
		.attr('id', 'btnConfirmWrapper'); // create wrapper for buttons (to flex align them in a row)
		
	d3.select('div#btnConfirmWrapper')
		.append('button')
		.attr('class', 'btnConfirm')
		.attr('id', 'btnYes')
		.html(g.buttonLingoLookup.supernovaConfirm.button.yes[g.lingoBouncer]); // create yes button

	d3.select('div#btnConfirmWrapper')
		.append('button')
		.attr('class', 'btnConfirm')
		.attr('id', 'btnNo')
		.html(g.buttonLingoLookup.supernovaConfirm.button.no[g.lingoBouncer]); // create no button

	d3.select('button#btnYes').on('mousedown', finalTurn1); // listen to the yes button
	d3.select('button#btnNo').on('mousedown', function() { 
		if (wasFlat) setProjection(); // if the world was flat reproject to flat projection
		d3.select('div#confirmEnd').remove() 
	}); // listen to the no button

}); // kill the game and kick-off the supernova

d3.select('button#stats').on('mousedown', function(){

	vis.stats.initContainer();

});


d3.selectAll('button').on('touchend', function(){
	
	d3.select(this)
		.style('color', '#555')
		.style('background-color', 'rgba(255, 255, 255, .7)'); // un:hover the button for touch-logic by just counteracting the main :hover styles inline

}); // touchend listener and handler


/* functions ----------------------------------------------------------------------------------- */

// mouse events

function mouseover(d,i){

		if (d3.event.target.tagName === 'path' && d.properties.adm0_a3 !== undefined) {

			var countryId = d.properties.adm0_a3;

		} // set country id

		d3.selectAll('path#' + countryId)
			.classed('hovered', true); // mouseovered country gets hover class (= opacity change)


		/* warm-cold effect set-up - begin */

		g.mouseCentroid = d3.geo.centroid(d3.select(this).data()[0]);

		if (!isNaN(g.mouseCentroid[0]) && g.findCentroid !== undefined && g.geoToFind !== undefined) {
			var distance = d3.geo.distance(g.mouseCentroid, g.findCentroid); // only calculate if both have values and geoToFind is defined
		}; // calulate the distance between mouse and country-to-find

		d3.selectAll('path#' + countryId)
			.style('fill', g.kolor(distance)); // best effect ever (wasn't me - coincidental find, but stan likes it too) ! colours the searched countries more blue when further away and more red when close. all other countries remain base colour. hence shows the trace of all visited countires.

		/* warm-cold effect - end */


		/* trigger ------------------------------------------------------------------------------------------------------------- */

		/* flag search */

		if (g.elementBouncer === 'flags' && g.geoToFind && g.geoToFind === countryId) {

			flagTrigger(countryId);

		}	// do when country is found during flag-search

		/* animal search */

		// if we're looking for animals, the geoToFind variable is not undefined (undefined when mouseover not over country) and the hovered over country is part of the array of the countries-to-find
		if (g.elementBouncer === 'animals' && g.geoToFind && g.geoToFind.indexOf(countryId) > -1) {

			animalTrigger();

		}	// do when area is found during animal-search

		/* trigger end --------------------------------------------------------------------------------------------------------- */

		if (!g.shortlist.length) {

			g.shortlistBouncer = true;

		} // kick off new shortlist production (starts at dragend)

		if (d3.select(this).classed('selected') && g.itemToFind === undefined) { showFlagTooltip(d) };  // generate tooltip for .selected countries

} // mouseover events

function mousemove(d,i){

	if(!d3.event.movementX) {
		g.moveDirXArray.push(d3.event.pageX); // create an array with every pageX coordinate
		if(g.moveDirXArray.length > 2) g.moveDirXArray.shift(); // only keep the current and the previous
		var directionX = Math.round(g.moveDirXArray[1] - g.moveDirXArray[0]); // calculate the distance
		d3.event.movementX = isNaN(directionX) ? 0 : directionX; // add it to the event object (return 0 for at least the first calculation which returns NaN as we only have one array item)
	}	// add direction variable to the event object if it's not supported by the browser (currently no support by IE and Safari): we get the current and the previous x position to calculate the distance

	// zoom and pan when hover
	if (g.zoomBouncer) zoomIn();

	if (d3.select(this).classed('selected')) {

	d3.select('div.tooltip')
		.style('left', (d3.event.pageX + 5) + 'px')
		.style('top', (d3.event.pageY + 5) + 'px');

	}
	
} // mousemove events

function mouseout(d,i){

	if (d3.event.target.tagName !== 'rect' && d.properties.adm0_a3 !== undefined) var id = d.properties.adm0_a3;

	d3.selectAll('#' + id)
		.classed('hovered', false);

	d3.select('div.tooltip')
		.transition()
		.style('opacity', 0); // fade out tooltip

} // mouseout events

// touch events

function touchmove(){

	event.preventDefault();

	// add direction variable to the d3.event object (corresponds to d3.event.movementX from mousemove): we get the current and the previous x position to calculate the distance
	g.touchDirXArray.push(d3.event.touches[0].pageX); // create an array with every pageX coordinate
	if(g.touchDirXArray.length > 2) g.touchDirXArray.shift(); // only keep the current and the previous
	var directionX = Math.round(g.touchDirXArray[1] - g.touchDirXArray[0]); // calculate the distance
	d3.event.directionX = isNaN(directionX) ? 0 : directionX; // add it to the event object (return 0 for at least the first calculation which returns NaN as we only have one array item)

	// zoom and pan when hover
	if (g.zoomBouncer) zoomIn();

 	// replacing mousover ?
	var currentX = d3.event.touches[0].pageX;
	var currentY = d3.event.touches[0].pageY;

	var elem = document.elementFromPoint(currentX, currentY);
	
	if (elem.tagName === 'path') {

		var d = d3.select('path#' + elem.id).data()[0]; // get 'd' the touch-way

		if(d.properties.adm0_a3 !== undefined){

			var countryId = d.properties.adm0_a3;

		}

	}; // set identifiers on country, continent and region level. nearly the same logic as for mouseover, yet slightly more roundabout due to touch limitations

	d3.selectAll('.hovered').classed('hovered', false); // remove all .hovered classes

	d3.selectAll('path#' + countryId).classed('hovered', true); // touched country gets hover class (= opacity change)


	/* warm-cold effect set-up - begin */

	g.mouseCentroid = d3.geo.centroid(d);

	// log(g.mouseCentroid);

	if (!isNaN(g.mouseCentroid[0]) && g.findCentroid !== undefined && g.geoToFind !== undefined) {
		var distance = d3.geo.distance(g.mouseCentroid, g.findCentroid); // only calculate if both have values and geoToFind is defined
	}; // calulate the distance between mouse and country-to-find

	d3.selectAll('path#' + countryId)
		.style('fill', g.kolor(distance)); // best effect ever (wasn't me - coincidental find, but stan likes it too) ! colours the searched countries more blue when further away and more red when close. all other countries remain base colour. hence shows the trace of all visited countires.

	/* warm-cold effect - end */

		/* trigger ------------------------------------------------------------------------------------------------------------- */

		/* flag search */

		if (g.elementBouncer === 'flags' && g.geoToFind && g.geoToFind === countryId) {

			flagTrigger(countryId);

		}	// do when country is found during flag-search

		/* animal search */

		// if we're looking for animals, the geoToFind variable is not undefined (undefined when mouseover not over country) and the hovered over country is part of the array of the countries-to-find
		if (g.elementBouncer === 'animals' && g.geoToFind && g.geoToFind.indexOf(countryId) > -1) {
			
			animalTrigger();

		}	// do when area is found during animal-search

		/* trigger end --------------------------------------------------------------------------------------------------------- */

		if (!g.shortlist.length) {

			g.shortlistBouncer = true;

		} // kick off new shortlist production (starts at dragend)

		// if (d3.select('path#' + id).classed('selected') && g.itemToFind === undefined) { showFlagTooltip(d) };  // generate tooltip for .selected countries

}	// touchmove (on body as touchmove only registers moves on elements the touch started from. dragging from the 'elements' section onto the .world section won't register)

function touchend(){
	
	d3.selectAll('.hovered').classed('hovered', false);
	
}


// triggers from within the handlers when elements found

function flagTrigger(countryId){
	
	d3.select('div.item#' + g.itemToFind).data()[0].found = 1; // the element's property 'found' is set to 1 when found, otherwise left at 0

	d3.selectAll('path#' + countryId)
		.style('fill', '#FFED32') // seems redundant as the class already fills the path, but if I don't apply a colour here setOriginalMapState() will fade the yellow in. It's better (I think) for the colour to come immediately at find.
		.classed('selected', true);	// apply selected class to found country

	d3.selectAll('div#' + countryId)
		.call(trans.foundDiv, 400); // change opacity to .2

	playFoundSound('flags', 'bing'); // play found sound (param 1: category, param 2: filename)

	g.shortlist = g.shortlist.filter(function(el) {
		return el.id !== g.geoToFind;
	}); // remove found country from shortlist

	d3.select('div#container').append('div').attr('id', 'lockElements'); // lay transparent div over element selection div in order to prevent 2 searches at a time which would cock up reprojection
	d3.select('div#container').append('div').attr('id', 'lockCollection'); // lay transparent div over collection selection div in order to prevent 2 searches at a time which would cock up reprojection
	d3.selectAll('img.subitem').transition().style('opacity', .7); // // add// remove visual clue that dragging is disabled  visual clue that dragging is disabled

	/* point calculation and display */

	getPoints('end', countryId) // calculate flag points

	vis.points.updateFlags(); // increase the vis.points flag counter
	vis.points.updateTotal(); // increase the vis.points total counter

	if(g.reprojectBouncer === false) setOriginalMapState(); // re-colour and reproject but only if its not currently recolouring /-projecting (can happen if country found or at dragend)

	g.itemToFind = undefined; // also gets emptied at dragend. required also here to generate tooltips only when not searching
	
}

function animalTrigger(){
	
	d3.select('div.item#' + g.itemToFind).data()[0].found = 1; // the element's property 'found' is set to 1 when found, otherwise left at 0

	var idsToFind = g.geoToFind.join(', #').replace(/^/g, '#'); // takes array of all countries the animals roam in and turns it into a comma-seperated string with the world-path id's in order to get a handle on them

	/* texture styling vs monochrome styling */

	if(g.foundStyle === 'texture') {

		d3.selectAll('path' + idsToFind)
			.classed('foundanimals', true)
			.style('fill', g.u.url()); // found animal algorithm 1: pattern - no colouring. decolouring by setOriginalMapState()

	} else if(g.foundStyle === 'mono') {

		d3.selectAll('path' + idsToFind)
			.style('stroke', '#00CC00')
			.style('fill', '#00CC00'); // found animal algorithm 2: colouring - no pattern. decolouring by setOriginalMapState()

	} // apply found style depending on g.foundStyle

	d3.selectAll('div.item#' + g.itemToFind)
		.call(trans.foundDiv, 400); // change opacity to .2

	playFoundSound('animals', g.itemToFind); // play found sound (param 1: category, param 2: filename)

	g.shortlist = g.shortlist.filter(function(el) {
		return el.id !== g.itemToFind;
	}); // remove found element from shortlist

	d3.select('div#container').append('div').attr('id', 'lockElements'); // lay transparent div over element selection div in order to disallow interaction with elements to prevent 2 searches at a time which would cock up reprojection
	d3.select('div#container').append('div').attr('id', 'lockCollection'); // lay transparent div over collection selection div in order to disallow interaction with elements to prevent 2 searches at a time which would cock up reprojection
	d3.selectAll('img.subitem').transition().style('opacity', .7); // // add/remove visual clue that dragging is disabled  visual clue that dragging is disabled
	// both above rules get removed at the end of the setTimeout in setOriginalMapState()

	/* point calculation and display */

	getPoints('end', g.geoToFind); // calculate animal points

	vis.points.updateAnimals(); // increase the vis.points animal counter
	vis.points.updateTotal(); // increase the vis.points total counter

	if (g.reprojectBouncer === false) setOriginalMapState(); // re-colour and reproject but only if its not currently recolouring /-projecting (can happen if country found or at dragend)
	
}


// zoom and pan 

function zoomIn() {

	if (g.project.type === 'globe') {
		
		var r = g.project[g.project.type].rotate();

		if(!d3.event.touches) {
			g.project[g.project.type]
				.scale(g.scale*1.2)
				.translate([g.width/1.5 - d3.event.x*.5, g.height/1.5 - d3.event.y*.5])
				.rotate([r[0] - d3.event.movementX*1.2, 0, 0]); // the mousemove version
		} else {
			g.project[g.project.type]
				.scale(g.scale*1.2)
				.translate([g.width/1.5 - d3.event.touches[0].pageX*.5, g.height/1.5 - d3.event.touches[0].pageY*.5])
				.rotate([r[0] - d3.event.directionX * 1.2, 0, 0]); // the touch version
		} // decide if touch or not depending on the touch array being available in the event object or not

		d3.selectAll('g.boundary path').attr('d', g.path); // previously i seperated sphere and world. if things break, this might be the reason. check v21 how it's been done before
		
	} // zoom and pan for globe

	if (g.project.type === 'flat') {
			
		if(!d3.event.touches) {
			g.project[g.project.type]
					.scale(g.scale*1.6)
					.translate([g.width - d3.event.x, g.height - d3.event.y]);
		} else {
			g.project[g.project.type]
				.scale(g.scale*2)
				.translate([g.width - d3.event.touches[0].pageX, g.height - d3.event.touches[0].pageY]);
		} // decide if touch or not depending on the touch array being available in the event object or not

		if(g.foundStyle === 'texture'){
			
			g.worldupdate.attr('d', g.path);  // required with texture.js highlighting
			
		} else if(g.foundStyle === 'mono'){
			
			g.worldupdate.call(trans.project, 700, 0, 'linear');  // not delayed
			
		} // texture decolouring transition doesn't go along with trans.project (unsolved) hence this division 

	} // zoom and pan for flat projection

} // zoomIn

function zoomOut(del) {

	del = del === undefined ? 1000 : del;
	
		g.project[g.project.type]
			.scale(g.scale)
			.translate([g.width/2.75, g.height/2.5]);

		if(g.elementBouncer === 'flags') {
				d3.selectAll('g.boundary path').call(trans.project, 250, del, 'linear');  // previously i seperated sphere and world. if things break, this might be the reason. check v21 how it's been done before
		} 
		if(g.elementBouncer === 'animals') {
				d3.selectAll('g.boundary path').call(trans.project, 250, del * 2, 'linear');  // previously i seperated sphere and world. if things break, this might be the reason. check v21 how it's been done before
		}
	
} // zoomOut. parameter sets delay

// texture styling vs monochrome styling
// there are 2 versions of styling the animal ranges when found. 
// the texture pattern is based on texture.js. it looks better but is more complex to apply. 
// it needs set-up of def-patterns and doesn't allow a smooth reprojection (trans.project) for the flat projection
// the mono pattern just colours the range area into a single colour. it looks more pedestrian but is easy to apply.
// it's no problem to set both versions up (in the trigger function in worldmap.mouseover), 
// but it's more problematic to transition the world back into its original state.
// setOriginalMapState() is the main function that does so. 

function setOriginalMapState(time) {

	time === undefined ? time = 1000 : time = time;

	g.geoToFind = undefined; // remove any paths to find, so that reapeated hover over found countries doesn't highlight them

	g.reprojectBouncer = true;

	if(g.foundStyle === 'texture') {

		if(g.elementBouncer === 'flags') {
			d3.selectAll('path.world:not(#sphere):not(.selected)').call(trans.decolour, '#ccc', time); // different transition for the areas targeted by decolouring...
			d3.selectAll('path.world.selected').call(trans.decolour, '#FFED32', time); // ...and the areas not targeted by the decolouring. This seems necessary to align all decolouring transitions with the reprojection transitions. Otherwise there will be a delay in the decolouring parts (probably as the decolouring transition interferes with the reprojection in zoomOut). Duration needs to be in line with delay in zoomOut(). if we work with textures here we need to pass the pattern function (for example g.t.url()) to the decolouring function.
			if(g.project.type === 'globe') d3.selectAll('path.world#sphere').call(trans.decolour, null, time); // the sphere is only visible for the globe, hence the if condtion. 

			g.zoomBouncer = false; // disallow zooming immediatley when found

			setTimeout(function(){

				zoomOut(100); // zoom out with a little delay
				g.reprojectBouncer = false;

				d3.select('div#lockElements').remove(); // remove element-locking div
				d3.select('div#lockCollection').remove(); // remove collection-locking div
				d3.selectAll('img.subitem').transition().style('opacity', 1) // remove visual clue that dragging is disabled 

			}, time * 1.1); // re-instate the original pattern after transition duration

		} // reproject after flag found

		if(g.elementBouncer === 'animals') {

			var patternId = g.u.url().substr(5,5); // get the id of the pattern element

			// var defMainSel = d3.select('pattern#' + patternId + ' > path')[0][0]; // get the path element of the defined line pattern
			var defBackSel = d3.select('pattern#' + patternId + ' > rect')[0][0]; // get the background rect element of the defined circle pattern
			var defMainSel = d3.selectAll('pattern#' + patternId + ' > circle')[0]; // get all circle elements of the defined circle pattern

			d3.selectAll(defMainSel).call(trans.depatternPattern, time * 2.5); // transition the pattern away

			d3.select(defBackSel).call(trans.decolourPattern, '#ccc', time * 2.5); // transition the pattern background-colour to normal colour

			d3.selectAll('path.world:not(.foundanimals):not(.selected):not(#sphere)').call(trans.decolour, '#ccc', time * .5);

			d3.selectAll('path.world.selected:not(.foundanimals)').call(trans.decolour, '#FFED32', time * .5);

			g.zoomBouncer = false; // disallow zooming immediatley when found

			setTimeout(function(){

				d3.selectAll('g + defs').remove(); // only remove defs adjacent to g-elements (which is true for the texture.js defs next to the world-g but not for the radial gradient defs)

				vis.map.svg.call(g.u);

				d3.selectAll('path.world:not(#sphere):not(.selected)').style('fill', '#ccc');

				d3.selectAll('path.world.selected').style('fill', '#FFED32');

				d3.selectAll('.foundanimals').classed('foundanimals', false);

				zoomOut(100);  // zoom out with a little delay (after setTimeout to not get twisted up with the transitions)

				g.reprojectBouncer = false;

				d3.select('div#lockElements').remove(); // remove element-locking div
				d3.select('div#lockCollection').remove(); // remove element-locking div
				d3.selectAll('img.subitem').transition().style('opacity', 1) // remove visual clue that dragging is disabled

			}, time * 2.5); // re-instate the original pattern after transition duration

		} // reproject after animal found


	} // reproject for texture highlighting (applied to animals only)
	
	if(g.foundStyle === 'mono') {

		if(g.elementBouncer === 'flags') {
			d3.selectAll('path.world:not(#sphere):not(.selected)').call(trans.decolour, '#ccc', time); // different transition for the areas targeted by decolouring...
			d3.selectAll('path.world.selected').call(trans.decolour, null, time); // ...and the areas not targeted by the decolouring. This seems necessary to align all decolouring transitions with the reprojection transitions. Otherwise there will be a delay in the decolouring parts (probably as the decolouring transition interferes with the reprojection in zoomOut). Duration needs to be in line with delay in zoomOut(). if we work with textures here we need to pass the pattern function (for example g.t.url()) to the decolouring function.
			if(g.project.type === 'globe') d3.selectAll('path.world#sphere').call(trans.decolour, null, time); // the sphere is only visible for the globe, hence the if condtion.
		}

		if(g.elementBouncer === 'animals') {
			d3.selectAll('path.world:not(#sphere):not(.selected)').call(trans.decolour, '#ccc', time * 2); // different transition for the areas targeted by decolouring...
			d3.selectAll('path.world.selected').call(trans.decolour, '#FFED32', time * 2); // ...and the areas not targeted by the decolouring. This seems necessary to align all decolouring transitions with the reprojection transitions. Otherwise there will be a delay in the decolouring parts (probably as the decolouring transition interferes with the reprojection in zoomOut). Duration needs to be in line with delay in zoomOut(). if we work with textures here we need to pass the pattern function (for example g.t.url()) to the decolouring function.
			if(g.project.type === 'globe') d3.selectAll('path.world#sphere').call(trans.decolour, null, time * 2); // the sphere is only visible for the globe, hence the if condtion. if we work with textures here we need to pass the pattern function (for example g.t.url()) to the decolouring function.
		} // colour versions

		// stop zoom and pan upon dragend (2nd option to stop zoom and pan)
		g.zoomBouncer = false;

		zoomOut(time);

		g.reprojectBouncer = false;

		setTimeout(function(){
			d3.select('div#lockElements').remove(); // remove element-locking div
			d3.select('div#lockCollection').remove(); // remove element-locking div
			d3.selectAll('img.subitem').transition().style('opacity', 1) // remove visual clue that dragging is disabled 
		}, (time * 1.5)); // lock time a compromise between flags time (* 1) and animals time (* 2)

		
	} // reproject for single colour highlighting (applied to animals only)


} // decolouring and zoomOut after element found. parameter sets time used for duration and zoomOout-delay triggered in function
// this is a working version of found animal algorithm 1: pattern - no colouring. it's more complex to operate but shows off the patterns.

function setProjection(){

	var time = 500; // delay/duration var

	reproject(.1); // current projection small

	g.worldupdate.call(trans.project, time*1, time*0, 'cubic'); // world small
	g.sphere.call(trans.project, time*1, time*0, 'cubic'); // sphere small

	g.sphere.call(trans.projectLight, time*0, time*1); // sphere light colours. could be just css class but who knows - I might want to doctor around with some fading effects in later life

	// 1*500 msec passed

	if(g.project.type === 'flat') {
		g.project.type = 'globe';
		d3.select('button#setProjection').html(g.buttonLingoLookup.setProjection[g.project.type][g.lingoBouncer]);
	} else {
		g.project.type = 'flat';
		d3.select('button#setProjection').html(g.buttonLingoLookup.setProjection[g.project.type][g.lingoBouncer]);
	} // change project.type

	reproject(1); // new projection small

	g.worldupdate.call(trans.project, time*0, time*1, 'linear'); // world new projection small
	g.sphere.call(trans.project, time*0, time*1, 'linear'); // sphere new projection small

	// 1*500 msec passed

	// new projection large
	g.bounds = g.path.bounds(g.mapdata);
  // g.scale = Math.min(g.width / (g.bounds[1][0] - g.bounds[0][0]), g.height / (g.bounds[1][1] - g.bounds[0][1])) * .75;
  g.scale = Math.min(g.width / (g.bounds[1][0] - g.bounds[0][0]), g.height / (g.bounds[1][1] - g.bounds[0][1])) * (g.project.type === 'globe' ? .75 : .79); // flat world needs a slightly larger scale factor

	reproject(g.scale);

	if(g.project.type === 'globe') {
		g.sphere.call(trans.projectDark, time*0, time*1.1); // sphere dark colours
	}

	g.worldupdate.call(trans.project, time*1.5, time*1.1, 'elastic'); // world big
	g.sphere.call(trans.project, time*1.5, time*1.1, 'elastic'); // sphere big

	// 2.6*500 msec passed; 1.1 in order to leave some breathing space (.1) for the g.bounds and g.scale calculation


} // world size reduces, projection changes, world size increases; sphere gets only coloured for globe-, not for flat projection. for original function see v13 and previous

function reproject(scale){

	g.project[g.project.type]
			.translate([g.width/2.75, g.height/2.5])
			.scale(scale);
	
} // re-project for setProjection function


// the final move

function finalTurn1() {

	// var n = new Date(); log('turn1', n.getMinutes(),	 n.getSeconds()); // used to time zarathustra

	playFoundSound('supernova', 'zarathustra'); // play it
	
	// d3.select('#setElementCategory')[0][0].disabled = true;
	// d3.select('#setProjection')[0][0].disabled = true;
	// d3.select('#zoom')[0][0].disabled = true;
	// d3.select('#supernova')[0][0].disabled = true;
	// d3.select('#lingo')[0][0].disabled = true;

	toggleButtons(true); // switch off (true) or on (false) all permanent buttons (this doesn't include the supernova confirm buttons)
	d3.select('#btnYes')[0][0].disabled = true;
	d3.select('#btnNo')[0][0].disabled = true; // disable all buttons

	setStartMeasures(true);
	
	var distance = 360; // absolute distance from start- to end-angle
	var velocity = .01675	; // .01675

	setSMILanim(true); // kick off SMIL animation
	
	d3.selectAll('div#confirmEnd')
		.transition()
		.duration(5000)
		.style('opacity', 0)
		.remove();

	d3.selectAll('div#controls, div#elements, div#collection')
		.transition()
		.duration(5000)
		.style('opacity', 0);

	d3.select('body')
		.transition()
		.duration(10000)
		.style('background-color', '#000');
		

	d3.selectAll('path.world:not(#sphere)')
		.transition()
		.duration(10000)
		.delay(7500)
		.style('fill', '#fff')
		.style('stroke', '#fff');
		
  d3.timer(function(elapsed) {

    var angle = (velocity * elapsed); // number increases continuously from 0

    g.project[g.project.type]
			.scale(startScale + angle*1.5)
			.rotate([(startYaw + angle),(startPitch + angle),(startRoll + angle)]); // need to  get current angle from projection.rotate()[0]

		d3.selectAll('g.boundary path').attr('d', g.path.projection(g.project[g.project.type])); // re-render path (by above positive increments)

		if (Math.abs(angle) > Math.abs(distance)) {
			setStartMeasures(false);
			finalTurn2();
			return true;
		}

  });

} // final spin 1

function finalTurn2() {

	setStartMeasures(true);

	var velocity = .02; // .02

	var maxIncrease = 1;
	var maxDur = 5000;
	var multConstant = maxIncrease/maxDur;

	var currentPoint = []; // set up the tracker of the current point (needed for supernova start point)

  d3.timer(function(elapsed) {

		var multiplier = elapsed * multConstant + 1;

    var angle = -(velocity * multiplier * elapsed); // number decreases continuously from 0

    g.project[g.project.type]
			.scale(startScale + angle*2.5)
			.rotate([(startYaw + angle),(startPitch + angle),(startRoll + angle)]); // need to  get current angle from projection.rotate()[0]

    d3.selectAll('g.boundary path').attr('d', g.path.projection(g.project[g.project.type])); // re-render path (by above positive increments)

		currentPoint[0] = g.sphere[0][0].getBoundingClientRect().left;
		currentPoint[1] = g.sphere[0][0].getBoundingClientRect().top; // measure current point (array gets overwritten all the time as only the last position needed)
		
		if (g.project[g.project.type].scale() < 3) {
			setSMILanim(false); // remove animation along path
			setStartMeasures(false); // remove global metrics
			d3.selectAll('g.boundary path').style('display', 'none'); // make world disapper with 'display: none'
			d3.selectAll('#controls').style('display', 'none'); // make world disapper with 'display: none'
			d3.selectAll('#elements').style('display', 'none'); // make world disapper with 'display: none'
			d3.selectAll('#collection').style('display', 'none'); // make world disapper with 'display: none'
			
			d3.select('body').style('background-color', '#000');
			supernova(currentPoint); // start supernova
			
			return true; // break out of current turning function
		} // exit game graphics - enter supernova graphics

  });

} // final spin 2

function supernova(position) {
	
	var width = g.width, height = g.height, nodes = [], svg = d3.select('#container > svg');
	var startPointX = position[0], startPointY = position[1];
	
	g.force = d3.layout.force()
	    .nodes(nodes)
	    .links([])
	    .size([width, height])
			.gravity(.0005) // .1 attraction to focal point. 0 none - 1 quite a lot (can go > 1)
			// .friction(.9) // .9 values in range [0,1], velocity decay, the higher the more decay
			// .charge(-30) // -30 negative value: node repulsion - positive value: node attraction
			// .theta(.8) //.8 not to worry - affects large clusters
			// .alpha(.1); // changing doesn't change much.1 controls the cooling paramater deciding the time it takes the layout to settle
			// set up the force

	g.force.on('tick', function(e) {
	  svg.selectAll('circle.shreds')
			.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
	}); // we decide what happens per tick (this adds the force to the circles)

	
	var interval = setInterval(function(){

	  nodes.push({
	    x: startPointX,
			y: startPointY
	  }); // we add a node determining the start coordinates

	  g.force.start(); // we start the layout

	  svg.selectAll('.shreds')
	    .data(nodes)
	    .enter().append('circle')
			.classed('shreds', true)
	    .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; })
	    .attr('r', 2)
	    .style('fill', 'hsl(' + Math.floor(Math.random()*360) + ', 100%, 80%)')
			.style('stroke', 'none')
			.call(g.force.drag); // data-join with each new node
	
	}, 5); // each interval we explode...
	

	d3.timer(function(elapsed){
		// 5000
		if (elapsed > 5000) {
			
			clearInterval(interval); // stop after x miliseconds

			setTimeout(function(){
				changeForce(.1, 1);
				d3.selectAll('circle.shreds')
					.transition()
					.duration(4000)
					.style('fill', '#fff');
			}, 5000); // let them dance 5
			setTimeout(function(){
				g.force.start();
			}, 10100); // restart dance 10
			setTimeout(function(){
				g.force.start();
			}, 15000); // restart dance again 15
			setTimeout(function(){
				changeForce(1, .05);
			}, 18000); // pull them together 18
			setTimeout(function(){
				d3.selectAll('circle.shreds')
					.transition()
					.style('fill', '#FFED32')
					.attr('r', 100)
					.transition()
					.duration(100)
					.ease('cubic')
					.style('fill', '#fff')
					.attr('r', 3);
			}, 18700); // change colour and size of our supernova 18.7
			setTimeout(function(){
				changeForce(.1, .9);
				twitch(); // let the remainders twitch
			}, 19000); // expand to agreeable sized ball of shreds 19
			setTimeout(function(){

				var n = d3.selectAll('circle.shreds')[0].length;
				var dur = 2950; //1000
				
				d3.selectAll('circle.shreds')
					.transition()
					.duration(dur)
					.delay(function(d,i) { return i / n * dur ; })
					.each('end', function(){
						d3.select(this)
							.style('fill', 'hsl(' + Math.floor(Math.random()*360) + ', 100%, 50%)')
							.attr('r', 3);
					});


				d3.selectAll('circle.shreds')
					.transition()
					.duration(dur + 50)
					.delay(function(d,i) { return (dur + 3050) + i / n * (dur + 50) ; })
					.each('end', function(){
						d3.select(this).transition()
							.style('fill', '#fff')
							.attr('r', 3);
						
					});

			}, 19050); // glitter 19.05
			setTimeout(function(){

				d3.select('div.tooltip')
					.style('left', (nodes[0].x) + 'px')
					.style('top', (nodes[0].y) + 'px')
					.html(g.tooltipGeneral.supernova.explode[g.lingoBouncer])
					.style('opacity', 0)
					.transition()
					.duration(1000)
					.delay(1000)
					.style('opacity', .8); // build and show tooltip 

				d3.select('div#audioContainer')
					.append('audio')
					.attr('id', 'plop1')
					.style('display', 'none')
					.attr('src', 'sounds/supernova/plop1.mp3'); // add audio element 1

				d3.select('div#audioContainer')
					.append('audio')
					.attr('id', 'plop2')
					.style('display', 'none')
					.attr('src', 'sounds/supernova/plop2.mp3'); // add audio element 2

				d3.selectAll('circle.shreds').on('mouseover', function(d){

					d3.select(this)
						.transition()
						.attr('r', 5)
						.style('fill', 'darkorange');

				}); // mouseover

				d3.selectAll('circle.shreds').on('mouseout', function(d){

					d3.select(this)
						.transition()
						.attr('r', 3)
						.style('fill', '#fff');
					
				}); // mouseout

				d3.selectAll('circle.shreds').on('mousedown', function(d){

					// d3.selectAll('circle.shreds').on('mouseover', null);
					// d3.selectAll('circle.shreds').on('mouseout', null); // remove event-listeners
					
					g.force.start();

					var plop1 = d3.select('audio#plop1')[0][0]; 
					var plop2 = d3.select('audio#plop2')[0][0]; // get audio tags into variables

					var n = d3.selectAll('circle.shreds:nth-child(n+10)')[0].length;
					
					d3.selectAll('circle.shreds:nth-child(n+10)')
						.transition()
						.duration(40)
						.delay(function(d,i) { return i/n*2000; })
						.ease('cubic')
						.attr('r', 100)
						.style('fill', 'firebrick')
						.each('end', function(d, i){
							plop1.pause(); // pause
							plop1.currentTime = 0; // rewind
							plop1.play(); // play
						})
						.remove(); // don't grab all nodes for the immediate explosion (this leaves 8 not 10 or 9 which is slightly surprising)
						
					d3.selectAll('circle.shreds:nth-child(-n+8)')
						.transition()
						.delay(3500) // 3500
						.duration(function(d,i) { return i*40; })
						.ease('cubic')
						.attr('r', 100)
						.style('fill', 'firebrick')
						.each('end', function(d, i){
							plop2.pause(); // pause
							plop2.currentTime = 0; // rewind
							plop2.play(); // play
						})
						.remove(); // explode all but 1 shred (not 2 which n+10 Minus -n+8 would suggest (?))

					d3.selectAll('circle.shreds').on('mousedown', resurrect); // add resurrection handler


						setTimeout(function(){

							if (d3.select('circle.shreds')[0].length > 0) {

								var x = d3.select('circle.shreds').data()[0].x;
							  var y = d3.select('circle.shreds').data()[0].y;

								d3.select('div.tooltip')
									.style('left', (x + 5) + 'px')
									.style('top', (y - 5) + 'px')
								 	.style('border', 'none')
								 	.style('background-color', 'transparent') // this took a moment as it didn't want to take 'none'
								 	.style('opacity','1') // opacity covers the whole thing including the font-color. so we want to set the background-color to transparent (so that the twitching shred won't be obscured by it) but the opacity of the div to 1 so that we can see the color.
								 	.style('color', '#000')
									.html(g.tooltipGeneral.supernova.resurrect[g.lingoBouncer])
									.transition()
									.duration(1000)
									.style('color', '#fff')
									.transition()
									.duration(20000)
								 	.style('color', '#000'); // tooltip fade in and out

							}

						}, 7000); // 11 show what the last star is saying
						


				}); // mousedown
				
			}, 35000); // add event listeners 35
			
			return true;		

		} // stop explosion after x miliseconds

	}); // d3.timer()

} // supernova()



// the final move - helper functions

function setSMILanim(toggle){
	
	if(toggle) {

		// SMIL animation
		d3.selectAll('g.boundary')
			.append('animateMotion')
			.attr('id', 'animateThis')
			.attr('path', 'M 0,0 a 200,100 0 1,0 400,0 a 200,100 0 1,0 -400,0') // M start a rx,y x-rotation larg-or-small-flag,sweep-flag (direction) 
			.attr('begin', 'indefinite') // need to set this to 'unspecified' as it would otherwise start on DOM-load (a little strange as it's just being created)
			.attr('dur', '15s')
			.attr('repeatCount', 'indefinite');

		document.getElementById('animateThis').beginElement(); // here we start the animation (http://stackoverflow.com/questions/8455773/svg-trigger-animation-with-event)

	} else {

		d3.select('animateMotion#animateThis').remove();

	} // if toggle = true start animation - if false stop it
	
} // kick off or stop the SMIL animation path for the world

function setStartMeasures(toggle) {
	if(toggle) {
		startYaw = g.project[g.project.type].rotate()[0]; // start yaw angle
		startPitch = g.project[g.project.type].rotate()[1]; // start pitch angle
		startRoll = g.project[g.project.type].rotate()[2]; // start roll angle
		startScale = g.project[g.project.type].scale(); // start-scale
		startPoint = g.project[g.project.type].translate(); // start point
	} else {
		if(startYaw) {
			delete window.startYaw;
			delete window.startPitch;
			delete window.startRoll;
			delete window.startScale;
			delete window.startPoint;
		} // do if one exists
	} // if toggle is true create the start measures, otherwise remove them
} // get or remove start measures

function changeForce(gravity, friction) {

	if(gravity === undefined) gravity = .1;
	if(friction === undefined) friction = .9;

	g.force
		.gravity(gravity)
		.friction(friction);

  g.force.start();


} // changeForce()

function twitch(delay, end) {

	if (delay === undefined) delay = 3000; // set arguments

	g.twitchInterval = setInterval(function(){ 
		
		g.force.start(); // pulsate
	
		d3.select('audio#heartbeat').remove(); // prep
	
		d3.select('div#audioContainer')
			.append('audio')
			.attr('id', 'heartbeat')
			.style('display', 'none')
			.attr('src', 'sounds/supernova/heartbeat.mp3'); // add heartbeat audio
	
			d3.select('audio#heartbeat')[0][0].play(); // play heartbeat audio
			
	}, delay); // setInterval

	// if (end) clearInterval(twitchInterval);
	
	
} // let it twitch


// the worlds resurrection

function resurrect() {
	
	var time = 500; // delay/duration var

	clearInterval(g.twitchInterval);
	d3.select('div#audioContainer *').remove(); // stop the heartbeat and clean up all audio elements
	

	/* new small projection and rotate into shape */
	
	g.project[g.project.type]
		.scale(1)
		.rotate([0, 0, 0]);

	g.worldupdate.call(trans.project, time*0, time*0, 'linear'); // world new projection small (dur, del, eas)
	g.sphere.call(trans.project, time*0, time*0, 'linear'); // sphere new projection small


	/* remove final shreds */
	
	playFoundSound('supernova', 'tone'); // play the gong
		
	d3.selectAll('circle.shreds')
		.transition()
		.duration(100)
		.attr('r', 250)
		.style('fill', '#FFED32')
		.transition()
		.duration(100)
		.attr('r', 0)
		.style('fill', '#fff')
		.remove();
	

	/* get the scenerie back up */

	d3.selectAll('#controls').style('display', null); // bring elements back on by removing display attribute
	d3.selectAll('#elements').style('display', null); // bring elements back on by removing display attribute
	d3.selectAll('#collection').style('display', null); // bring elements back on by removing display attribute

	d3.select('body')
		.transition()
		.duration(time)
		.style('background-color', '#D9EBFA');

	d3.selectAll('div#controls')
		.transition()
		.duration(time*2)
		.style('opacity', 1);

	d3.selectAll('div#elements, div#collection')
		.transition()
		.duration(time*2)
		.style('opacity', 1)
		.style('background-color', 'rgba(255, 255, 255, .2)');

	d3.select('div.tooltip')
		.style('border', null)
		.style('color', null)
		.style('background-color', null);



	/* resize projection to normal */

	g.bounds = g.path.bounds(g.mapdata);
  g.scale = Math.min(g.width / (g.bounds[1][0] - g.bounds[0][0]), g.height / (g.bounds[1][1] - g.bounds[0][1])) * (g.project.type === 'globe' ? .75 : .79); // flat world needs a slightly larger scale factor

	reproject(g.scale);

	g.sphere.call(trans.projectDark, time*0, time*1.1); // sphere dark colours

	g.worldupdate.call(trans.project, time*1.5, time*2, 'elastic'); // world big
	g.sphere.call(trans.project, time*1.5, time*2, 'elastic'); // sphere big
	
	
	/* show the world again */
	
	setTimeout(function(){
		
		d3.selectAll('g.boundary path').style('display', null); // bring elements back on by removing display attribute
		
		d3.selectAll('path.world:not(#sphere)')
			.style('stroke', '#aaa')
			.style('fill', '#ccc');

		d3.selectAll('path.world.selected')
			.style('fill', '#FFED32');
		
		playFoundSound('supernova', 'plop1'); // play the gong
		
	}, time*2); // as we have already a named transition running on the world we use setTimeout instead of delay here (or instead of writing another named transition - easier to read this way)


	toggleButtons(false); // switch off (true) or on (false) all permanent buttons (this doesn't include the supernova confirm buttons)
	
} // resurrect()

function toggleButtons(flag) {
	
	d3.select('#setElementCategory')[0][0].disabled = flag;
	d3.select('#setProjection')[0][0].disabled = flag;
	d3.select('#zoom')[0][0].disabled = flag;
	d3.select('#supernova')[0][0].disabled = flag;
	d3.select('#lingo')[0][0].disabled = flag; // enable all buttons
	
	
} // toggleButtons()



// other functions

function turn(distance, d) {
	
	// d3.select('#setProjection')[0][0].disabled = true;
	// d3.select('#zoom')[0][0].disabled = true; // disable buttons during turn
	toggleButtons(true); // switch off (true) or on (false) all permanent buttons (this doesn't include the supernova confirm buttons)
	
	distance = distance === undefined ? 360 : distance;

	var startAngle = g.project[g.project.type].rotate()[0]; // start-angle
	var dist = distance; // absolute distance from start- to end-angle

	var velocity = .15;
	var then = Date.now();

  d3.timer(function() {

    var angle = (velocity * (Date.now() - then)); // number increases continuously from 0

		angle = dist < 0 ? -angle : angle; // if distance is less than 0 the projection needs to go west meaning the current longitude needs to decrease which happens when the angle is negative. otherwise it needs to increase which happens with positive angles.

    g.project[g.project.type].rotate([(startAngle + angle),0,0]); // need to  get current angle from projection.rotate()[0]
    g.worldupdate.attr('d', g.path.projection(g.project[g.project.type])); // re-render path (by above positive increments)

		if (Math.abs(angle) > Math.abs(dist)) {
			// d3.select('#setProjection')[0][0].disabled = false;
			// d3.select('#zoom')[0][0].disabled = false; // enable buttons after turn (disable again during highlight)
			toggleButtons(false); // switch off all permanent buttons (this doesn't include the supernova confirm buttons)

			if (d) highlightCountry(d); // only trigger when d is defined (= when we want to highlight a country from the collection - not when we highlight animal ranges)

			return true; // break out of timer when the angle is passed the distance
		}

  });

} // spinning the globe


function highlightCountry(d) {
	
	// d3.select('#setProjection')[0][0].disabled = true;
	// d3.select('#zoom')[0][0].disabled = true; // disable buttons during country highlighting
	toggleButtons(true); // switch off all permanent buttons (this doesn't include the supernova confirm buttons)
	
	var time = 900;

	var x = d3.select('path#' + d.id)[0][0].getBBox().x;
	var y = d3.select('path#' + d.id)[0][0].getBBox().y;
	var width = d3.select('path#' + d.id)[0][0].getBBox().width;
	var height = d3.select('path#' + d.id)[0][0].getBBox().height; // get this path's bounding rect

	d3.select('path#' + d.id)
		.transition()
		.duration(time*.9)
		.ease('cubic-in-out')
		.attr('transform', 'translate(' + (-x-width/2) + ', ' + (-y-height/2) + ') scale(2)') // scale moves the 0 x,y point x to the right and y to the bottom. the width and height is required to keep the path centered.
		.style({'fill': 'darkorange', 'stroke': 'darkorange'}); // transition out

	d3.select('path#' + d.id)
		.transition()
		.duration(time*.5)
		.delay(time)
		.ease('bounce')
		.attr('transform', 'translate(0, 0) scale(1)')
		.style({'fill': '#FFED32', 'stroke': '#999'}); // transition back


	// d3.select('#setProjection')[0][0].disabled = false;
	// d3.select('#zoom')[0][0].disabled = false; // enable buttons after country highlighting
	toggleButtons(false); // switch off all permanent buttons (this doesn't include the supernova confirm buttons)

	
} // highlight country from collection


function playFoundSound(category, filename){

	
	d3.selectAll('audio#audio').remove(); // remove previous sound if still running. New sound removes old sound
		
	d3.select('div#audioContainer')
		.append('audio')
		.attr('id', 'audio')
		.style('display', 'none')
		.attr('src', 'sounds/' + category + '/' + filename + '.mp3'); // add audio element

		d3.select('audio#audio')[0][0].play(); // play sound

		d3.select('audio#audio').on('ended', function(){
			d3.selectAll('audio#audio').remove();
		}); // remove audio element
	
} // play an appropriate sound when the item was found


function showFlagTooltip(d) {
	
	d3.selectAll('div.tooltip').html('');

	var selectId = d.properties.adm0_a3; // get the country id

	// variables to identify found animals
	var collectedData = d3.selectAll('div#animalsCollection > .piece').data();
	var anmlFound = [];
	var anmlArrayFound = {
		cleanName: [],
		English: [],
		German: []
	};

	// get all animals already found for respective country
	collectedData.forEach(function(el) {
		if (el.country.indexOf(selectId) > -1) {
			anmlFound.push(el);
			anmlArrayFound.cleanName.push(el.id);
			anmlArrayFound.German.push(el.nameGerman);
			anmlArrayFound.English.push(el.nameEnglish);
		} // if the animal exists in the respective country, push it into the final arrays
	}); // loop through all found animals


	// variables to identify non-found animals
	var uncollectedData = g.animalData;
	uncollectedData.forEach(function(el){ 
		el.countryArr = el.country.split(', '); 
	}); // changing the country variable in the animalData from string to array in order to apply same logic in the following loop

	var anmlNotFound = [];
	var anmlArrayNotFound = {
		cleanName: [],
		English: [],
		German: []
	};

	// get all animals not yet found for respective country
	uncollectedData.forEach(function(el) {
		if (el.countryArr.indexOf(selectId) > -1) {
			anmlNotFound.push(el);
			anmlArrayNotFound.cleanName.push(el.cleanAnimalName);
			anmlArrayNotFound.German.push(el.nameGerman);
			anmlArrayNotFound.English.push(el.nameEnglish);
		} // if the animal does not exist in the respective country, push it into the final arrays
	}); // loop through all not found animals

	// prepare population text
	var pop;
	if (d.properties.pop_est >= 1e+6) {
		pop = Math.round(d.properties.pop_est/1e+6) + g.tooltipGeneral.populationBig[g.lingoBouncer];
	} else if (d.properties.pop_est < 1e+6) {
		pop = g.formatSep(d.properties.pop_est).replace(/,/g, g.tooltipGeneral.seperator[g.lingoBouncer]) + g.tooltipGeneral.populationSmall[g.lingoBouncer];
	} else {
		pop = '';
	} // sort out some countries with -99 people

	// prepare found and non-found animal lists
	var foundAsNum = anmlArrayFound[g.lingoBouncer].length;
	var foundText;
	if(foundAsNum === 1) {
		foundText = foundAsNum + g.tooltipGeneral.foundAnimals.singular[g.lingoBouncer];
	} else {
		foundText = foundAsNum + g.tooltipGeneral.foundAnimals.plural[g.lingoBouncer];
	}
	var foundAs = anmlArrayFound[g.lingoBouncer].join(', ');

	var unfoundAsNum = anmlArrayNotFound[g.lingoBouncer].length;
	var unfoundText;
	if(unfoundAsNum === 1) {
		unfoundText = unfoundAsNum + g.tooltipGeneral.unfoundAnimals.singular[g.lingoBouncer];
	} else {
		unfoundText = unfoundAsNum + g.tooltipGeneral.unfoundAnimals.plural[g.lingoBouncer];
	}
	var unfoundAs = anmlArrayNotFound[g.lingoBouncer].join(', ');

	// prepare country info
	var points = g.formatSep(g.flagpointsPerCountry[selectId].points).replace(/,/g, g.tooltipGeneral.seperator[g.lingoBouncer]);
	var duration;
	if (g.flagpointsPerCountry[selectId].time < .5) {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + g.flagpointsPerCountry[selectId].time + g.tooltipGeneral.seconds.singular[g.lingoBouncer]; // singular with decimals
	} else if (g.flagpointsPerCountry[selectId].time < 1.5) {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + Math.round(g.flagpointsPerCountry[selectId].time) + g.tooltipGeneral.seconds.singular[g.lingoBouncer]; // singular without decimals
	} else {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + Math.round(g.flagpointsPerCountry[selectId].time) + g.tooltipGeneral.seconds.plural[g.lingoBouncer]; // plural without decimals
	}
	var area = g.flagpointsPerCountry[selectId].area < .5 ? g.flagpointsPerCountry[selectId].area : Math.round(g.flagpointsPerCountry[selectId].area);
	area = g.tooltipGeneral.size.flags[g.lingoBouncer] + area + g.tooltipGeneral.area[g.lingoBouncer];

	// produce the tooltip html
	var tooltipText = 
	'<ul>\
		<li>' + d.properties['name' + g.lingoBouncer] + '</li>\
		<li>' + points + ' ' + g.tooltipGeneral.points[g.lingoBouncer] + '</li>\
		<li>' + duration + '</li>\
		<li>' + pop + '</li>\
		<li>' + area + '</li>\
		<li> &nbsp; </li>\
		<li class="foundanimals">' +  foundText + '</li>\
		<li class="foundanimalsPics"></li>\
		<li class="unfoundanimals">' + unfoundText + '</li>\
	</ul>'

	d3.select('div.tooltip')
		.style('left', (d3.event.pageX + 5) + 'px')
		.style('top', (d3.event.pageY + 5) + 'px')
		.html(tooltipText)
		.style('opacity', 0)
		.transition()
		.style('opacity', .8); // build and show tooltip 

	if(anmlArrayFound.English.length < 1){
		d3.selectAll('li.foundanimals').style('display', 'none');
	} // only display list of found animals when there is a list

	if(anmlArrayNotFound.English.length < 1){
		d3.selectAll('li.unfoundanimals').style('display', 'none');
	} // only display list of not found animals when there is a list (not in use)

	d3.select('li.foundanimalsPics')
		.selectAll('.anmlPics')
		.data(anmlArrayFound.cleanName)
		.enter()
		.append('img')
		.attr('src', function(d) { return 'images/animals/' + d + '.png'; })
		.classed('anmlPics', true); // add found images to tooltip
	
} // generate tooltip

function showAnimalTooltip(info){

	// vars
	var coords = getAnimalTipCoords(); // get x and y coordinates
	var animal = info.attr('id'); // get animal name
	var d = info.data()[0]; // get element data
	
	// prepare tooltip info
	var points = g.formatSep(g.animalpointsPerArea[animal].points).replace(/,/g, g.tooltipGeneral.seperator[g.lingoBouncer]);
	var duration;
	if (g.animalpointsPerArea[animal].time < .5) {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + g.animalpointsPerArea[animal].time + g.tooltipGeneral.seconds.singular[g.lingoBouncer]; // singular with decimals
	}	else if (g.animalpointsPerArea[animal].time < 1.5) {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + Math.round(g.animalpointsPerArea[animal].time) + g.tooltipGeneral.seconds.singular[g.lingoBouncer]; // singular without decimals
	} else {
		duration = g.tooltipGeneral.duration[g.lingoBouncer] + Math.round(g.animalpointsPerArea[animal].time) + g.tooltipGeneral.seconds.plural[g.lingoBouncer]; // plural without decimals
	} 
	var area = g.animalpointsPerArea[animal].area < .5 ? g.animalpointsPerArea[animal].area : Math.round(g.animalpointsPerArea[animal].area);
	area = g.tooltipGeneral.size.animals[g.lingoBouncer] + area + g.tooltipGeneral.area[g.lingoBouncer];

	// produce the tooltip html
	var tooltipText = 
	'<ul>\
		<li>' + d['name' + g.lingoBouncer] + '</li>\
		<li>' + points + ' ' + g.tooltipGeneral.points[g.lingoBouncer] + '</li>\
		<li>' + duration + '</li>\
		<li>' + area + '</li>\
	</ul>'
	
	// add the tooltip
	d3.select('div.tooltip')
		.style('top', coords.y + 'px')
		.style('left', coords.x + 'px')
		.html(tooltipText)
		.transition()
		.style('opacity', .8);
	
} // showAnimalTooltip() - takes the hovered over selection as input

function getAnimalTipCoords(){
	var coords = {};
	coords.x = d3.event.pageX, coords.y = d3.event.pageY - 120; // get the coords
	coords.x = coords.x < g.width/2 ? coords.x + 10 : coords.x - 200;
	return coords;
} // get offset x and y coordinates for animal tooltip position


function getAreaPointsLookup() {

	// create lookup table of area points (highest for smallest country lowest for largest country)
	var ids = [];
	g.flagDataOrig.forEach(function(el){
		ids.push(el.id);
	}); // get all country ids

	var steradianArea = [];
	ids.forEach(function(el){
		var feature = d3.select('path#' + el).data()[0];
		var area = d3.geo.area(feature);
		steradianArea.push(area);
	}); // calculate the steradian area for each country http://whatis.techtarget.com/definition/steradian

	var areaSum = steradianArea.reduce(function(a, b){
		return a + b;
	}); // calculate the sum of all steradians...

	var steradianShr = [];
	steradianArea.forEach(function(el){
		var shr = el/areaSum;
		steradianShr.push(shr);
	}); // ...in order to calculate a share for each country's area

	var areaPoints = [];
	steradianShr.forEach(function(el){
		var delta = 1/el*.5;
		var delta = delta.toFixed(3);
		areaPoints.push(delta);
	}); // inverse the points per country (largest gets fewest points - smallest gets most points). do for 1/2 of the espective flagpoints which produces a maximum of c. 30k. also reduce decimals.

	var areaPointsLookup = {
		flagpoints: {},
		steradianshare: {}
	};
	for (var i = 0; i < areaPoints.length; i++){
		areaPointsLookup.flagpoints[ids[i]] = +areaPoints[i];
		areaPointsLookup.steradianshare[ids[i]] = +steradianShr[i];
	} // create the lookup table showing country id's as keys and their points as a value

	return areaPointsLookup;
	
} // generate lookup table showing points player reveives for each country as well as the steradian share for each country (this is to calculate the animal points on the fly)

function getPoints(trigger, id) {
	
	if (trigger === 'start') {
	
		g.searchtimeStart = Date.now(); // start time
	
	} else if (trigger === 'end') {

		g.searchtimeEnd = Date.now(); // end time
		g.searchtime = (g.searchtimeEnd - g.searchtimeStart) / 1000; // get the search time in seconds
		g.searchtimeFactor = Math.pow(1/g.searchtime, 0.7) * 7; // inverse to turn high to low numbers, to the power of 7 to reduce the slope of the decay, * 7 to have a maximum factor of 7

		var areaPointsLookup = getAreaPointsLookup(); // generate a lookup table for the points each player gets for finding a particular country
		
		if (g.elementBouncer === 'flags') {

			g.prevFlagpoints = g.flagpoints; // flagpoints before respective flag found
			g.prevTotalpoints = g.totalpoints; // totalpoints before respective flag found
			
			var thisFlagpoints = areaPointsLookup.flagpoints[id]; // get points for respective country 
			thisFlagpoints = Math.round(thisFlagpoints * g.searchtimeFactor) // produce the final points

			g.flagpoints += thisFlagpoints; // add final flag points to the total
			g.totalpoints += thisFlagpoints; // update the total points 
			g.totalFlagSearchtime += g.searchtime; // update total time searched for flags
			g.totalSearchtime += g.searchtime; // update total search time
			g.flagsToFind--;
			g.flagsFound++;
			g.totalFlagarea += +(areaPointsLookup.steradianshare[id] * 100).toFixed(2);
			
			g.flagpointsPerCountry[id] = {
				points: thisFlagpoints,
				time: +(g.searchtime).toFixed(2),
				area: +(areaPointsLookup.steradianshare[id] * 100).toFixed(2)
			}; // add points of respective country to the tracker

		} else if (g.elementBouncer === 'animals') {

			g.prevAnimalpoints = g.animalpoints; // animalpoints before respective animal found
			g.prevTotalpoints = g.totalpoints; // totalpoints before respective flag found

			var thisAnimalpoints = 0;
			var thisSteradianshare = 0;

			for (var i = 0; i < id.length; i++) {
				var points = isNaN(areaPointsLookup.steradianshare[id[i]]) ? 0 : areaPointsLookup.steradianshare[id[i]]; // second floor. In case there's a mistake in the animal-data and the countries aren't sperated by a comma, we will get a 0 here.
				thisSteradianshare += points;
			}
			
			thisAnimalpoints = Math.round((1/thisSteradianshare * 10) * g.searchtimeFactor);

			g.animalpoints += thisAnimalpoints;
			g.totalpoints += thisAnimalpoints; // update the total points 
			g.totalAnimalSearchtime += g.searchtime; // update total time searched for flags
			g.totalSearchtime += g.searchtime; // update total search time
			g.animalsToFind--;
			g.animalsFound++;

			g.animalpointsPerArea[g.itemToFind] = {
				points: thisAnimalpoints,
				time: +(g.searchtime).toFixed(2),
				area: +(thisSteradianshare * 100).toFixed(2)
			}; // add points of respective animal to the tracker
			
		} // point calculations for flags and animals

		g.searchtime = 0; // set the search time to 0

	} // distinguishing in start and end actions
	
	if (g.flagsToFind === 0 && g.animalsToFind === 0) {
		setTimeout(function(){
			finalTurn1(); 
		}, 2000); // wait for 2 seconds 
		
	}	// trigger supernova when all animals and flags are found

} // function to calculate the points for finding flags


// named transitions

var trans = {};

trans.foundDiv = function(element, dur) {
	element.transition()
		.duration(dur)
		.style('opacity', .2);
}

trans.appearingElementDiv = function(element, divHeight) {
	element.transition()
		.delay(function(d,i) { return i*200; })
		.style('height', divHeight + 'px');
}

trans.appearingElementText = function(element, fontSize) {
	element.transition()
		.delay(function(d,i) { return i*200; })
		.style('font-size', fontSize + 'px');
}

trans.dragstartMoveElementInPosition = function(element) {
	element.transition()
		.style('left', (d3.mouse(this[0][0].parentNode)[0]) + 'px') // d3.mouse(of container), differs to calling it without named transition ([0][0])
		.style('top', (d3.mouse(this[0][0].parentNode)[1]) + 'px');
}

trans.dragendMoveElementBack = function(element, d) {
	element.transition()
		.style('left', d.xo + 'px')
		.style('top', d.yo + 'px');
}

trans.dragendMoveElementToCollection = function(element) {

	var body = d3.select('body')[0][0]; // took a moment. getting the document not the window width is a cross-browser problem. I settled for body.clientWidth which seems fine

	element.transition()
		.duration(500)
		.style('left', (-body.clientWidth * .85) + 'px')
		.style('top', (body.clientHeight * .85) + 'px')
		.style('height', '10px')
		.style('opacity', 0);
		
}


trans.project = function(element, dur, del, eas){

	element.transition()
		.duration(dur)
		.delay(del)
		.ease(eas)
		.attr('d', g.path.projection(g.project[g.project.type]));
}

trans.projectLight = function(element, dur, del){

	element.transition()
		.duration(dur)
		.delay(del)
		.style({'stroke': '#D9EBFA', 'fill': '#D9EBFA'})
		.attr('filter', null);  // added
}

trans.projectDark = function(element, dur, del){

	element.transition()
		.duration(dur)
		.delay(del)
	// .style({'stroke': '#bbb', 'fill': '#050FE8'}); // removed
		.style({'stroke': null, 'fill': null})  // added
		.attr('filter', 'url(#glow)');  // added
		
}


trans.decolour = function(element, col, dur) {

	element.transition()
		.duration(dur)
		.style('stroke', '#999') // for animal search as borders get coloured as well (in the mono setting at least)
		.style('fill', col); // .transition().duration(1e-6).style('fill', null); // I had this extra piece in here prior version 15. unsure as to why exactly, as it seems to work without. put back in if things go wrong with the decolouring during zoomOut

}

trans.depatternPattern = function(element, time) {
		
	element.transition()
		.duration(time * .2)
		.delay(time * .8)
		.attr('r', 0); // transition the pattern's pattern

}

trans.decolourPattern = function(element, col, time) {
	
	element.transition()
		.duration(time * .2)
		.delay(time * .8)
		.style('fill', col);
	
}


trans.heightImage = function(element, height){

	element.transition()
		.style('height', height);

}

trans.fontSizeImg = function(element, fontSize) {
	
	element.transition()
		.style('font-size', fontSize);
	
}




/* ---------------- */
/* unused functions */
/* ---------------- */

/* utility function to get an array of countries */

// d3.select('button#zoom').on('mousedown', function(){
// 	g.zoomBouncer = true;
// });
//
// var idArray = [];
// var clickCount = 0;
//
// d3.selectAll('.world').on('click', function(d){
// 	if(d3.select(this).classed('selected')){
// 		d3.select(this).classed('selected', false);
// 		if(idArray.indexOf(d.properties.adm0_a3) > -1) _.pull(idArray,d.properties.adm0_a3);
// 	} else {
// 		d3.select(this).classed('selected', true);
// 			if(clickCount === 0) {
// 				idArray.push(d.properties.adm0_a3);
// 			} else if(idArray.indexOf(d.properties.adm0_a3) === -1){
// 				idArray.push(d.properties.adm0_a3);
// 			}
// 	}
// 	clickCount++;
// 	log(idArray);
// });
	
/* utility function to get an array of clicked countries (used to get range map per animal)*/


/*	simple turn function (prior to country highlight refinements)
		function turn() {

			var startAngle = g.project[g.project.type].rotate()[0], // start-angle
					dist = 360; // absolute distance from start- to end-angle

			var velocity = .15,
		  		then = Date.now();

		  d3.timer(function() {

		    var angle = (velocity * (Date.now() - then)); // number increases continuously from 0

		    g.project[g.project.type].rotate([(startAngle + angle),0,0]); // need to  get current angle from projection.rotate()[0]
		    g.worldupdate.attr('d', g.path.projection(g.project[g.project.type])); // re-render path (by above positive increments)
		    // g.worldupdate.call(reproject,0,0); // re-render path (by above positive increments)

				if (angle > dist) return true;

		  });

		} // spinning the globe */

/*  turn logic as component pattern. only slight irritation is the SMIL jump from first to second turn.
	  I'm using the verbose way here as it's easier to read and debug. yes more code, but hey... 

		var turnIt = turnFactory();
		function turnFactory(){

			var distance = 360, velocity = .015, scaleFactor = 1.5, setContinue = true;

			function my(){

				var startYaw = g.project[g.project.type].rotate()[0]; // start yaw angle
				var startPitch = g.project[g.project.type].rotate()[1]; // start pitch angle
				var startRoll = g.project[g.project.type].rotate()[2]; // start roll angle
				var startScale = g.project[g.project.type].scale(); // start-scale
				var startPoint = g.project[g.project.type].translate(); // start coordinate

				var maxIncrease = 1;
				var maxDur = 6000;
				var multConstant = maxIncrease/maxDur; // base metrics for multipler (which can be used to in-, or decrease other metrics)

				setSMILanim(true); // kick off SMIL animation

			  d3.timer(function(elapsed) {

					var multiplier = elapsed * multConstant + 1; // can be used to speed up any motion-metrics

			    var angle = setContinue ? (velocity * elapsed) : -(velocity * multiplier * elapsed); // number increases continuously from 0

			    g.project[g.project.type]
						.scale(startScale + angle * scaleFactor)
						.rotate([(startYaw + angle),(startPitch + angle),(startRoll + angle)]); // need to  get current angle from projection.rotate()[0]

					d3.selectAll('g.boundary path').attr('d', g.path.projection(g.project[g.project.type])); // re-render path (by above positive increments)

					if(setContinue) {
	
						if (Math.abs(angle) > Math.abs(distance)) {
	
							var turnItAgain = turnFactory()
								.velocity(.02)
								.scaleFactor(2.5)
								.setContinue(false);
	
							turnItAgain();
		
							setContinue = false;
		
							return true;
						} // what next ?
	
					} else {
	
						if (g.project[g.project.type].scale() < 3) {

							// trigger firework

							return true;
						}
	
					} // continue once more or exit


			  }); // d3.timer

			} // function my


			// configuration of getters/setters

			my.distance = function(value){
				if(!arguments.length) return distance;
				distance = value;
				return my;
			}

			my.velocity = function(value){
				if(!arguments.length) return velocity;
				velocity = value;
				return my;
			}

			my.scaleFactor = function(value){
				if(!arguments.length) return scaleFactor;
				scaleFactor = value;
				return my;
			}

			my.setContinue = function(value){
				if(!arguments.length) return setContinue;
				setContinue = value;
				return my;
			}

			return my;

		} // turnFactory */

