function Renderer()
{
	var _this = this;

	// Colors
	var MAP_COLORS = {
	    // Features
	    OCEAN:     '#3d667d',
	    COAST:     '#b1b484',
	    LAKESHORE: '#225588',
	    LAKE:      '#3d667d',
	    RIVER:     '#225588',
	    MARSH:     '#2f6666',
	    ICE:       '#c6def1',
	    BEACH:     '#b1b484',
	    // Terrain
	    SNOW:                       '#ffffff',
	    TUNDRA:                     '#bbbbaa',
	    BARE:                       '#888888',
	    SCORCHED:                   '#555555',
	    TAIGA:                      '#99aa77',
	    SHRUBLAND:                  '#889977',
	    TEMPERATE_DESERT:           '#c9d29b',
	    TEMPERATE_RAIN_FOREST:      '#448855',
	    TEMPERATE_DECIDUOUS_FOREST: '#679459',
	    GRASSLAND:                  '#69701d',
	    SUBTROPICAL_DESERT:         '#d2b98b',
	    TROPICAL_RAIN_FOREST:       '#337755',
	    TROPICAL_SEASONAL_FOREST:   '#559944'
	};

	// Set up Raphael for rendering.
	var viewport = document.getElementById('viewport');
	this.paper = new Raphael(viewport, MAP_WIDTH, MAP_HEIGHT);

	this.caravanMarker = null;
	this.endMarker = null;
	this.travelMarkers = [];

	// Initialize the canvas for a given map.
	this.init = function(map)
	{
		// Render the Centers.
        for(var i = 0; i < map.centers.length; i++)
        {
            var c = map.centers[i];
            var pathString = 'M' +  c.corners[0].point.x + ',' + c.corners[0].point.y;
            for(var j = 1; j < c.corners.length; j++)
            {
                var cr = c.corners[j];
                pathString += 'L' + cr.point.x + ',' + cr.point.y;
            }
            pathString += 'Z';

            var color = MAP_COLORS[c.biome];
            // Adjust the color based on the Center's elevation. Darker is lower.
            if(!c.water) { color = this.darkenColor(color, -1 * (1 - c.elevation) * 20); }
            c.svg = this.paper.path(pathString).attr({'fill':color,'stroke-width':0});
        }

        // Render the Edges.
        for(var i = 0; i < map.edges.length; i++)
        {
            var e = map.edges[i];
            var isRiver = e.river && !e.water && !e.coast;
            if(e.va.border || e.vb.border) { continue; }
            
            e.svg = this.paper.path(
                'M' + e.va.point.x + ',' + e.va.point.y +
                'L' + e.vb.point.x + ',' + e.vb.point.y + 'Z'
            ).attr({'stroke':(isRiver ? '#3d667d' : '#000000'),'stroke-width':(isRiver ? 3.2 : 0.2)});
        }

        // Render the town markers.
        for(var i = 0; i < map.centers.length; i++)
        {
        	var c = map.centers[i];
        	if(c.town.hasTown && !c.equals(map.endingLocation))
        	{
        		c.town.svg = this.paper.image("library/assets/img/markerHouse.png",
        			c.point.x - 11, c.point.y - 30, 22, 30)
        	}
        }

        // Render the end marker.
        this.endMarker = this.paper.image("library/assets/img/markerStar_yellow.png",
        	map.endingLocation.point.x - 17, map.endingLocation.point.y - 45, 33, 45);
        this.colorEdges(map.endingLocation, '#d2c61d');

        // Render the caravan marker.
        this.caravanMarker = this.paper.image("library/assets/img/markerStar.png",
        	map.startingLocation.point.x - 17, map.startingLocation.point.y - 45, 33, 45);
        this.colorEdges(map.startingLocation, '#cf3823');
        this.markerBounce(this.caravanMarker);
	}

	// Bounce the given marker element up and down.
	this.markerBounce = function(element)
    {
    	element.animate({transform:"t0,-10"}, 800, "easeOut", function()
    		{ element.animate({transform:"t0,0"}, 800, "easeIn", function()
    			{ _this.markerBounce(element); }) });
    }

	// Darken a given hex color by some percentage and return the new hex.
	this.darkenColor = function(color, percent)
	{
    	var num = parseInt(color.slice(1),16), amt = Math.round(2.55 * percent), R = (num >> 16) + amt, G = (num >> 8 & 0x00FF) + amt, B = (num & 0x0000FF) + amt;
    	return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255)).toString(16).slice(1);
	}

	// Color the edges of a given center the given color.
	this.colorEdges = function(center, color)
	{
		for(var i = 0; i < center.borders.length; i++)
		{
			var e = center.borders[i];
			e.svg.attr({'stroke':color,'stroke-width':2.5});
		}
	}

	// Reset how the edges of a given Center are rendered to the default.
	this.resetEdges = function(center)
	{
		for(var i = 0; i < center.borders.length; i++)
		{
			var e = center.borders[i];
			var isRiver = e.river && !e.water && !e.coast;
			e.svg.attr({'stroke':(isRiver ? MAP_COLORS['LAKE'] : '#000000'),'stroke-width':(isRiver ? 3.2 : 0.2)});
		}
	}

	// Reset the fill color of the given Center.
	this.resetFillColor = function(center)
	{
		var color = MAP_COLORS[center.biome];
        if(!center.water) { color = this.darkenColor(color, -1 * (1 - center.elevation) * 20); }
        center.svg.attr({'fill':color});
	}
}