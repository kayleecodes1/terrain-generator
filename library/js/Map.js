var MAP_WIDTH = 1000;
var MAP_HEIGHT = 600;

function Map(map_size)
{
    var BBOX = {xl:0,xr:MAP_WIDTH,yt:0,yb:MAP_HEIGHT};

    var NUM_POINTS = 500;
    if(map_size == 'medium') { NUM_POINTS = 1000; }
    if(map_size == 'large') { NUM_POINTS = 2000; }
    var RELAX_ITERATIONS = 2;

    var points = null;
    var voronoi = null;
    var diagram = null;

    this.map_scale = Math.floor(10 * (NUM_POINTS / 2000)); // miles per pixel
    this.map_height_scale = 2000; // highest elevation in meters

    this.centers = null;
    this.corners = null;
    this.edges = null;
    
    this.startingLocation = null;
    this.endingLocation = null;

    // 0 to 1. Fraction of water Corners
    // required for a Center to be water.
    var LAKE_THRESHOLD = 0.3;

    noise.seed(Math.random());
    INSIDE_SCALE = (Math.random() * 10) + 4;
    INSIDE_RANDOM_SHIFT = ((Math.random() * 0.15) + 0.25);

    this.init = function()
    {
        this.generateTerrain();
    }

    this.generateTerrain = function()
    {
        var stages = [];

        // Generate the initial set of random points.
        stages.push(['Placing random points...',
            function()
            {
                points = this.generateRandomPoints();
            }]);

        // Improve the points by relaxing them.
        stages.push(['Improving random points...',
            function()
            {
                voronoi = new Voronoi();
                for(var i = 0; i < RELAX_ITERATIONS; i++) {
                    this.relaxPoints();
                }
            }]);

        // Build a graph structure for the constructed Voronoi diagram. This
        // creates a set of Centers, Corners, and Edges that represent our
        // Voronoi diagram and are related to eachother so the diagram can be
        // easily traversed. This gives us access to useful traversal of both
        // the Voronoi polygons and the related Delaunay triangles.
        stages.push(['Building graph structure...',
            function()
            {
                diagram = voronoi.compute(points, BBOX);
                this.buildGraph();
                this.improveCorners();

                points = null;
                voronoi.recycle(diagram);
                voronoi = null;
                diagram = null;
            }]);

        // Determine map elevations.
        stages.push(['Assigning elevations...',
            function()
            {
                this.assignCornerElevations();
                this.assignOceanCoastAndLand();
                this.redistributeElevations(this.landCorners(this.corners));

                // Assign elevations to non-land corners.
                for(var i = 0; i < this.corners.length; i++)
                {
                    var cr = this.corners[i];
                    if(cr.ocean || cr.coast)
                    {
                        cr.elevation = 0.0;
                    }
                }

                this.assignCenterElevations();
            }]);

        // Determine moisture attributes for the map.
        stages.push(['Assigning moisture...',
            function()
            {
                this.calculateDownslopes();
                this.calculateWatersheds();
                this.createRivers();

                this.assignCornerMoisture();
                this.redistributeMoisture(this.landCorners(this.corners));
                this.assignCenterMoisture();
            }]);

        // Add decorations to the map, like biomes.
        stages.push(['Decorating the map...',
            function()
            {
                this.assignBiomes();

                this.generateCitiesAndTowns();

                this.chooseStartAndEndPoints();
            }]);

        stages.push(['Terrain generation complete.',
            function()
            {

            }]);

        // Execute all of the stages and keep the user updated.
        for(var i = 0; i < stages.length; i++)
        {
            console.log(stages[i][0]);//TODO:make real loader
            stages[i][1].call(this);
        }
    }

    // Generate a set of random points to use to generate Voronoi polygons.
    this.generateRandomPoints = function()
    {
        var points = [];
        for(var i = 0; i < NUM_POINTS; i++)
        {
            var p = {
              x: Math.random() * (MAP_WIDTH - 20) + 10,
              y: Math.random() * (MAP_HEIGHT - 20) + 10
            };
            points.push(p);
        }
        return points;
    }

    // Improves the current set of points to make sure they're not too close
    // together. Here we will use Lloyd relaxation to move the points to the
    // centroid of the Voronoi polygon that they represent.
    this.relaxPoints = function()
    {
        diagram = voronoi.compute(points, BBOX);
        for(var i = 0; i < points.length; i++)
        {
            var p = { x: 0, y: 0 };
            var cell = diagram.cells[points[i].voronoiId];
            for(var j = 0; j < cell.halfedges.length; j++)
            {
                var q = cell.halfedges[j].getStartpoint();
                p.x += q.x;
                p.y += q.y;
            }
            p.x /= cell.halfedges.length;
            p.y /= cell.halfedges.length;
            points[i] = p;
        }
        voronoi.recycle(diagram);
    }

    // Build a graph of Centers, Corners, and Edges using the data that has
    // been assembled using the Voronoi library.
    this.buildGraph = function()
    {
        this.centers = [];
        this.corners = [];
        this.edges = [];

        // Create a Center for each Voronoi cell and store it in a hash map
        // that pairs coordinates with Centers.
        var centerHashMap = new HashMap();
        for(var i = 0; i < diagram.cells.length; i++)
        {
            var c = diagram.cells[i];

            var center_new = new Center(i, {x: c.site.x, y: c.site.y});
            this.centers.push(center_new);
            centerHashMap.put(c.site.x + "-" + c.site.y, center_new);
        }

        // Create a Corner for each Voronoi vertex that begins an edge and
        // store it in a hash map that pairs coordinates with Corners.
        var cornerHashMap = new HashMap();
        for (var i = 0; i < diagram.edges.length; i++)
        {
            var e = diagram.edges[i];

            // Create a Corner for each vertex if it doesn't already exist.
            var corner_new1 = new Corner(i, {x: e.va.x, y: e.va.y});
            if(cornerHashMap.get(e.va.x + "-" + e.va.y) === undefined)
            {
                this.corners.push(corner_new1);
                cornerHashMap.put(e.va.x + "-" + e.va.y, corner_new1);
            }
            var corner_new2 = new Corner(i, {x: e.vb.x, y: e.vb.y});
            if(cornerHashMap.get(e.vb.x + "-" + e.vb.y) === undefined)
            {
                this.corners.push(corner_new2);
                cornerHashMap.put(e.vb.x + "-" + e.vb.y, corner_new2);
            }
        }

        // Iterate over all of the Voronoi edges.
        for (var i = 0; i < diagram.edges.length; i++)
        {
            var e = diagram.edges[i];

            // Get the Centers to the left and right of this edge.
            var center1 = centerHashMap.get(e.lSite.x + "-" + e.lSite.y);
            var center2 = e.rSite !== null ? centerHashMap.get(e.rSite.x + "-" + e.rSite.y) : undefined;

            // Get the Corners for this edge.
            var corner1 = cornerHashMap.get(e.va.x + "-" + e.va.y);
            var corner2 = cornerHashMap.get(e.vb.x + "-" + e.vb.y);

            // Create an Edge representing this Voronoi edge.
            var edge_new = new Edge(i, corner1, corner2, center1, center2);
            this.edges.push(edge_new);

            // Add both Centers to each other.
            if(center2 !== undefined)
            {
                center1.addCenter(center2);
                center2.addCenter(center1);
            }

            // Add the Corners to both Centers.
            center1.addCorner(corner1);
            center1.addCorner(corner2);
            if(center2 !== undefined)
            {
                center2.addCorner(corner1);
                center2.addCorner(corner2);
            }

            // Add the Edge to both Centers.
            center1.addEdge(edge_new);
            if(center2 !== undefined) { center2.addEdge(edge_new); }

            // Add the Centers to both Corners.
            corner1.addCenter(center1);
            if(center2 !== undefined) { corner1.addCenter(center2); }
            corner2.addCenter(center1);
            if(center2 !== undefined) { corner2.addCenter(center2); }

            // Add both Corners to each other.
            corner1.addCorner(corner2);
            corner2.addCorner(corner1);

            // Add the Edge to both Corners.
            corner1.addEdge(edge_new);
            corner2.addEdge(edge_new);
        }

        // Make sure Centers have corners in edge order.
        for(var i = 0; i < this.centers.length; i++)
        {
            var cell = diagram.cells[i];
            var ordered_corners = [];
            for(var j = 0; j < cell.halfedges.length; j++)
            {
                var v = cell.halfedges[j].getStartpoint();
                ordered_corners.push(cornerHashMap.get(v.x + "-" + v.y));
            }
            this.centers[i].corners = ordered_corners;
            //TODO:no need to add corners previously if this is how we do it
        }
    }

    // Relaxing the points with Lloyd's algorithm ensured a good distribution
    // for our polygon centers but it doesn't guarantee anything about the
    // edges. Short edges are still very possible. This function moves corners
    // to the averge of the polygon centers around them. This lengthens short
    // edges and somewhat shortens long edges, making all polygons slightly
    // more uniform.
    this.improveCorners = function()
    {
        var corners_new = [];

        // Compute the average of Centers next to each Corner before modifying.
        for(var i = 0; i < this.corners.length; i++)
        {
            cr = this.corners[i];

            if(cr.border)
            {
                corners_new[i] = cr.point;
            }
            else
            {
                var point = {x: 0, y: 0};
                for(var j = 0; j < cr.touches.length; j++)
                {
                    point.x += cr.touches[j].point.x;
                    point.y += cr.touches[j].point.y;
                }
                point.x /= cr.touches.length;
                point.y /= cr.touches.length;
                corners_new[i] = point;
            }
        }

        // Move the Corners to the newly calculated points.
        for(var i = 0; i < corners_new.length; i++)
        {
            this.corners[i].point = corners_new[i];
        }

        // Re-calculate Edge midpoints since the Corners have moved.
        for(var i = 0; i < this.edges.length; i++)
        {
            var e = this.edges[i];
            e.midpoint = {
                x: (e.va.x + e.vb.x) / 2,
                y: (e.va.y + e.vb.y) / 2
            };
        }
    }

    // Determine elevation for each Corner and determine whether it is water.
    this.assignCornerElevations = function()
    {
        var queue = [];

        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];

            cr.water = !this.isInside(cr.point);

            // If the Corner is on the edge of the map, it has elevation 0.
            if(cr.border)
            {
                cr.elevation = 0.0;
                // Borders will be the initial set of Corners to update.
                queue.push(cr);
            }
            else
            {
                cr.elevation = Number.POSITIVE_INFINITY;
            }
        }

        // Go through the graph (starting at the borders) and increase
        // elevation as we move away from the edge of the map. This ensures
        // that rivers will always have a way to the coast when going downhill.
        while(queue.length > 0)
        {
            cr = queue.shift();

            for(var i = 0; i < cr.adjacent.length; i++)
            {
                a = cr.adjacent[i];

                // Each step up is a small amount above water or 1 above land.
                // The actual numbers don't really matter because elevations
                // will be rescaled later.
                var newElevation = 0.01 + cr.elevation;
                if(!cr.water && !a.water)
                {
                    newElevation += 1;
                }

                // If the new elevation is less than the adjacent's current
                // elevation modify the elevation and put it into the queue
                // so its neighbors can be updated.
                if(newElevation < a.elevation)
                {
                    a.elevation = newElevation;
                    queue.push(a);
                }
            }
        }
    }

    // Determine for each Center and Corner whether it is ocean, coast, or land.
    this.assignOceanCoastAndLand = function()
    {
        // Decide if a Center should be water (ocean or coast). Count the water
        // Corners for each Center. Oceans are all connected to the edge of the
        // map by others marked ocean.
        var queue = [];

        // Mark the edges of the map as ocean.
        for(var i = 0; i < this.centers.length; i++)
        {
            var c = this.centers[i];

            var numWater = 0;
            for(var j = 0; j < c.corners.length; j++)
            {
                var cr = c.corners[j];

                if(cr.border)
                {
                    c.border = true;
                    c.ocean = true;
                    cr.water = true;
                    queue.push(c);
                }
                if(cr.water)
                {
                    numWater += 1;
                }
            }
            c.water = (c.ocean || numWater >= c.corners.length * LAKE_THRESHOLD);
        }

        // Mark any water Center connected to an ocean as ocean.
        while(queue.length > 0)
        {
            var c = queue.shift();
            for(var i = 0; i < c.neighbors.length; i++)
            {
                var n = c.neighbors[i];

                if(n.water && !n.ocean)
                {
                    n.ocean = true;
                    queue.push(n);
                }
            }
        }

        // Determine whether each Center is a coast. If it has at least one
        // ocean and at least one land neighbor then it is a coast.
        for(var i = 0; i < this.centers.length; i++)
        {
            var c = this.centers[i];

            var numOcean = 0;
            var numLand = 0;
            for(var j = 0; j < c.neighbors.length; j++)
            {
                var n = c.neighbors[j];

                numOcean += n.ocean ? 1 : 0;
                numLand += !n.water ? 1 : 0;
            }
            c.coast = (numOcean > 0) && (numLand > 0);
        }

        // Set each Corner's attributes based on the Center attributes that
        // have been set. If all Centers connected to a Corner are ocean, then
        // the Corner is ocean. If all are land, it is land. In any other case,
        // it is coast.
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];

            var numOcean = 0;
            var numLand = 0;

            for(var j = 0; j < cr.touches.length; j++)
            {
                var t = cr.touches[j];

                numOcean += t.ocean ? 1 : 0;
                numLand += !t.water ? 1 : 0;
            }

            cr.ocean = (numOcean == cr.touches.length);
            cr.coast = (numOcean > 0) && (numLand > 0);
            cr.water = cr.border ||
                ((numLand != cr.touches.length) && !cr.coast);
        }
    }

    // Modify the distribution of elevations so that lower elevations are more
    // common than higher elevations. We want elevation X to have frequency
    // (1-X). To do this we'll sort the Corners and then set each one.
    this.redistributeElevations = function(corners)
    {
        // SCALE_FACTOR increases mountain area as it increase. At 1.0 the
        // highest elevation is barely noticeable.
        var SCALE_FACTOR = 1.1;

        // Sort the Corners by elevation.
        corners.sort(
            function(a, b)
            {
                return a.elevation - b.elevation;
            });

        for(var i = 0; i < corners.length; i++)
        {
            // Let y(x) be the total area that we want at elevation <= x; We
            // want the higher elevations to occur less than lower elevations,
            // so we set the area to be y(x) = 1 - (1-x)^2.
            var y = i / (corners.length - 1);
            // Then we have to solve for x, given the known y.
            var x = Math.sqrt(SCALE_FACTOR) - Math.sqrt(SCALE_FACTOR*(1-y));
            if(x > 1.0) { x = 1.0; }
            corners[i].elevation = x;
        }
    }

    // Given an array of Centers, return an array of the Centers that are land.
    this.landCenters = function(centers)
    {
        var centers_land = [];
        for(var i = 0; i < centers.length; i++)
        {
            var c = centers[i];
            if(!c.ocean)
            {
                centers_land.push(c);
            }
        }
        return centers_land;
    }

    // Given an array of Corners, return an array of the Corners that are land.
    this.landCorners = function(corners)
    {
        var corners_land = [];
        for(var i = 0; i < corners.length; i++)
        {
            var cr = corners[i];
            if(!cr.ocean && !cr.coast)
            {
                corners_land.push(cr);
            }
        }
        return corners_land;
    }

    // Center elevations are the average of their associated Corner elevations.
    this.assignCenterElevations = function()
    {
        for(var i = 0; i < this.centers.length; i++)
        {
            var c = this.centers[i];
            var sumElevation = 0.0;
            for(var j = 0; j < c.corners.length; j++)
            {
                var cr = c.corners[j];
                sumElevation += cr.elevation;
            }
            c.elevation = sumElevation / c.corners.length;
        }
    }

    // Determine whether a given point is inside of the island (it is land).
    // This function uses perlin noise combined with the distance from the
    // center of the map. Land is more likely in the center.
    this.isInside = function(point)
    {
        // Essentially, if the point's corresponding perlin pixel is greater
        // than .3 it will be included and an additional .3 padding can be
        // added depending on the point's distance from the map center.
        var c = Math.abs(noise.perlin2(point.x/MAP_WIDTH*INSIDE_SCALE, point.y/MAP_HEIGHT*INSIDE_SCALE));
        var radius =
            Math.sqrt(Math.pow(2*(point.x/MAP_WIDTH-0.5), 2) +
                Math.pow(2*(point.y/MAP_HEIGHT-0.5), 2));
        return c > (0.3+0.3*radius*radius) - INSIDE_RANDOM_SHIFT;
    }

    // Calculate the downslope for each Corner. It should point to the Corner
    // that is most downhill from it, meaning the lowest elevation Corner in
    // its set of adjacent Corners.
    this.calculateDownslopes = function()
    {
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];
            var downhill = cr;
            for(var j = 0; j < cr.adjacent.length; j++)
            {
                a = cr.adjacent[j];
                if(a.elevation <= downhill.elevation)
                {
                    downhill = a
                }
            }
            cr.downslope = downhill;
        }
    }

    // Calculate the watershed of every land Corner. The watershed is the last
    // downstream land Corner in the downslope graph.
    this.calculateWatersheds = function()
    {
        // Initially the watershed pointer points downslope one step.
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];
            cr.watershed = cr;
            if(!cr.ocean && !cr.coast)
            {
                cr.watershed = cr.downslope;
            }
        }

        // Follow the downslope pointers to the coast. This is limited to 100
        // iterations until is is stopped.
        for(var i = 0; i < 100; i++)
        {
            var changed = false;
            for(var j = 0; j < this.corners.length; j++)
            {
                var cr = this.corners[j];//console.log(cr);
                if(!cr.ocean && !cr.coast && !cr.watershed.coast)
                {
                    var w = cr.downslope.watershed;
                    if(!w.ocean) { cr.watershed = w; }
                    changed = true;
                }
            }
            if(!changed) { break; }
        }

        // Determine the size of each watershed.
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];
            var w = cr.watershed;
            w.watershed_size = 1 + (w.watershed_size || 0);
        }
    }

    // Create rivers along edges. Pick a random corner point then move downhill
    // from there. Mark edges and corners as rivers along this path.
    this.createRivers = function()
    {
        for(var i = 0; i < (MAP_WIDTH + MAP_HEIGHT) / 4; i++)
        {
            var cr = this.corners[Math.floor(Math.random() * this.corners.length)];
            if(cr.ocean || cr.elevation < 0.3 || cr.elevation > 0.9) { continue; }
            while(!cr.coast)
            {
                if(cr == cr.downslope)
                {
                    break;
                }
                var e = this.lookupEdgeFromCorner(cr, cr.downslope);
                e.river = e.river + 1;
                cr.river = (cr.river || 0) + 1;
                cr.downslope.river = (cr.downslope.river || 0) + 1;
                cr = cr.downslope;
            }
        }
    }

    // Calculate moisture for all Corners. Freshwater sources spread moisture,
    // meaning rivers and lakes (not oceans). Saltwater sources have moisture
    // but do not spread it. It gets set at the end after propagation.
    this.assignCornerMoisture = function()
    {
        var queue = [];

        // Calculate for fresh water.
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];
            if((cr.water || cr.river > 0) && !cr.ocean)
            {
                cr.moisture = cr.river > 0 ? Math.min(3.0, (0.2 * cr.river)) : 1.0;
                queue.push(cr);
            }
            else
            {
                cr.moisture = 0.0;
            }
        }
        while(queue.length > 0)
        {
            var cr = queue.shift();

            for(var i = 0; i < cr.adjacent.length; i++)
            {
                var a = cr.adjacent[i];
                var newMoisture = cr.moisture * 0.9;
                if(newMoisture > a.moisture)
                {
                    a.moisture = newMoisture;
                    queue.push(a);
                }
            }
        }

        // Calculate for salt water.
        for(var i = 0; i < this.corners.length; i++)
        {
            var cr = this.corners[i];
            if(cr.ocean || cr.coast)
            {
                cr.moisture = 1.0;
            }
        }
    }

    // Adjust distribution of moisture on given array of Corners to be evenly
    // distributed. We sort by moisture and then simply assign numbers from
    // 0 to 1 based pn this sorting.
    this.redistributeMoisture = function(corners)
    {
        // Sort the Corners by moisture.
        corners.sort(
            function(a, b)
            {
                return b.moisture - a.moisture;
            });

        // Assign new moistures.
        for(var i = 0; i < corners.length; i++)
        {
            corners[i].moisture = i/(corners.length - 1);
        }
    }

    // Assign moisture to the Centers. It's just the average moisture of all
    // of its associated Corners.
    this.assignCenterMoisture = function()
    {
        for(var i = 0; i < this.centers.length; i++)
        {
            var c = this.centers[i];
            var sumMoisture = 0.0;
            for(var j = 0; j < c.corners.length; j++)
            {
                var cr = c.corners[j];
                if(cr.moisture > 1.0) { cr.moisture = 1.0; }
                sumMoisture += cr.moisture;
            }
            c.moisture = sumMoisture / c.corners.length;
        }
    }

    // Assign biome types to all of the Centers.
    this.assignBiomes = function()
    {
        for(var i = 0; i < this.centers.length; i++)
        {
            var c = this.centers[i];
            c.biome = this.getBiome(c);
        }
    }

    // Return the biome type for the given Center. If the Center is ocean,
    // coast, or water then that decides the biome. Otherwise, biome is based
    // on elevation and on moisture level.
    this.getBiome = function(center)
    {
        if(center.ocean)
        {
            return 'OCEAN';
        }
        else if(center.water)
        {
            if(center.elevation < 0.1) { return 'MARSH'; }
            if(center.elevation > 0.8) { return 'ICE'; }
            return 'LAKE';
        }
        else if(center.coast)
        {
            return 'BEACH';
        }
        else if(center.elevation > 0.8)
        {
            if (center.moisture > 0.50) { return 'SNOW'; }
            else if (center.moisture > 0.33) { return 'TUNDRA'; }
            else if (center.moisture > 0.16) { return 'BARE'; }
            else { return 'SCORCHED'; }
        }
        else if(center.elevation > 0.6)
        {
            if (center.moisture > 0.66) { return 'TAIGA'; }
            else if (center.moisture > 0.33) { return 'SHRUBLAND'; }
            else { return 'TEMPERATE_DESERT'; }
        }
        else if(center.elevation > 0.3)
        {
            if (center.moisture > 0.83) { return 'TEMPERATE_RAIN_FOREST'; }
            else if (center.moisture > 0.50) { return 'TEMPERATE_DECIDUOUS_FOREST'; }
            else if (center.moisture > 0.16) { return 'GRASSLAND'; }
            else { return 'TEMPERATE_DESERT'; }
        }
        else
        {
            if (center.moisture > 0.66) { return 'TROPICAL_RAIN_FOREST'; }
            else if (center.moisture > 0.33) { return 'TROPICAL_SEASONAL_FOREST'; }
            else if (center.moisture > 0.16) { return 'GRASSLAND'; }
            else { return 'SUBTROPICAL_DESERT'; }
        }
    }

    // Create random cities and towns on the map. Choose randomly from all of
    // the Centers on the map that are land.
    this.generateCitiesAndTowns = function()
    {
        var NUM_TOWNS = (Math.random() * 8) + 10;
        NUM_TOWNS = Math.floor(NUM_TOWNS * (NUM_POINTS / 2000));
        var land_centers = this.landCenters(this.centers);
        var town_indices = [];

        for(var i = 0; i < NUM_TOWNS; i++)
        {
            var randomTown = land_centers[Math.floor(Math.random() * land_centers.length)];
            if(town_indices.indexOf(randomTown.index) == -1)
            {
                town_indices.push(randomTown.index);
                var town_center = this.centers[randomTown.index];
                town_center.town.hasTown = true;
                town_center.town.name = this.generateTownName();
            }
            else { i--; }
        }
    }

    // Generate a random town name and return it.
    this.generateTownName = function()
    {
        var first = ["Alton", "Mallno", "Maple", "Thron", "Oak", "Hallardrin",
            "Melek", "Mul", "Barren", "Arro", "Kyn", "Lake", "Ala", "Turg",
            "Helden", "Arin", "Iron", "Ward", "Aer", "Den", "Rwen", "Baa",
            "Lowen", "Batter", "Stin", "High", "Oak", "River", "Sparrow", "Even",
            "Mill"];
        var second = ["down", "dale", "dil", " Ridge", "crest", "wood", "'s",
            "thal", "ure", "berry", "hoff", "mouth", "drill", "keep", "spar",
            "burg", "spike", "och", "dros", "apple", "dia", "tor", "caster",
            "gard", "spire", "top", "mead", "haven", "far", "turn"];
        var third = [" Spring", " by the Sea", " Deep", " End", " Nor",
            " Ridge", " Falls", " Lake", " Point", " Cross", " Heights"];

        var townName = first[Math.floor(Math.random() * first.length)] +
            second[Math.floor(Math.random() * second.length)] +
            (Math.random() > .75 ? third[Math.floor(Math.random() * third.length)] : "");

        return townName;
    }

    // Choose start and end points on the map. The start point should be in the
    // left 25% of the map and the end point should be in the rigt 25%.
    this.chooseStartAndEndPoints = function()
    {
        var land_centers = this.landCenters(this.centers);
        var start_centers = [];
        var end_centers = [];

        for(var i = 0; i < land_centers.length; i++)
        {
            var c = land_centers[i];
            if(c.point.x <= MAP_WIDTH * 0.25)
            {
                start_centers.push(c);
            }
            else if(c.point.x >= MAP_WIDTH * 0.75)
            {
                end_centers.push(c);
            }
        }

        this.startingLocation = start_centers[Math.floor(Math.random() * start_centers.length)];
        this.endingLocation = end_centers[Math.floor(Math.random() * end_centers.length)];
        this.endingLocation.town.hasTown = true;
        this.endingLocation.town.name = this.generateTownName();
    }

    // Find an Edge given two adjacent Centers.
    this.lookupEdgeFromCenter = function(c1, c2)
    {
        for(var i = 0; i < c1.borders.length; i++)
        {
            var e = c1.borders[i];
            if(e.da.equals(c2) || e.db.equals(c2)) { return e; }
        }
        return null;
    }

    // Find an Edge given its two Corners.
    this.lookupEdgeFromCorner = function(cr1, cr2)
    {
        for(var i = 0; i < cr1.protrudes.length; i++)
        {
            var e = cr1.protrudes[i];
            if(e.va.equals(cr2) || e.vb.equals(cr2)) { return e; }
        }
        return null;
    }

    // Initialize the map.
    this.init();
}

/*---------------------------------------------------------------------------*
 * GRAPH STRUCTURES
 *---------------------------------------------------------------------------*/
function Center(index, point)
{
    this.index = index;
    this.point = { x: parseInt(point.x.toFixed(2)), y: parseInt(point.y.toFixed(2)) };

    this.water;  // Lake or ocean
    this.ocean;  // Ocean
    this.coast;  // Touches land and ocean polygons.
    this.border; // At the edge of the map.
    this.biome;
    this.elevation; // 0.0 - 1.0
    this.moisture; // 0.0 - 1.0

    this.town = {
        hasTown: false,
        name: "",
        svg: undefined
    };

    this.neighbors = []; // Adjacent Centers.
    this.corners = []; // Corners around this Center.
    this.borders = []; // Edges around this Center.

    this.svg;

    this.equals = function(center)
    {
        return this.point.x == center.point.x &&
            this.point.y == center.point.y;
    }

    this.addCenter = function(center)
    {
        var centerExists = false;
        for(var i = 0; i < this.neighbors.length; i++)
        {
            if(this.neighbors[i].equals(center))
            {
                centerExists = true;
                break;
            }
        }
        if(!centerExists)
        {
            this.neighbors.push(center);
        }
    }

    this.addCorner = function(corner)
    {
        var cornerExists = false;
        for(var i = 0; i < this.corners.length; i++)
        {
            if(this.corners[i].equals(corner))
            {
                cornerExists = true;
                break;
            }
        }
        if(!cornerExists)
        {
            this.corners.push(corner);
        }
    }

    this.addEdge = function(edge)
    {
        var edgeExists = false;
        for(var i = 0; i < this.borders.length; i++)
        {
            if(this.borders[i].equals(edge))
            {
                edgeExists = true;
                break;
            }
        }
        if(!edgeExists)
        {
            this.borders.push(edge);
        }
    }
}
function Corner(index, point)
{
    this.index = index;
    this.point = { x: parseInt(point.x.toFixed(2)), y: parseInt(point.y.toFixed(2)) };
    // Need to round Corner coordinates in case they are technically a border
    // Corner but just a little bit off.
    this.point.x = Math.round(this.point.x);
    this.point.y = Math.round(this.point.y);

    this.water; // Lake or ocean
    this.ocean; // Ocean
    this.coast; // Touches land and ocean polygons.
    this.border = this.point.x == 0 ||
        this.point.x == MAP_WIDTH ||
        this.point.y == 0 ||
        this.point.y == MAP_HEIGHT; // At the edge of the map.
    this.elevation; // 0.0 - 1.0
    this.moisture; // 0.0 - 1.0

    this.downslope; // Pointer to adjacent corner most downhill.
    this.river; // 0 if no river, or volume of water in river.
    this.watershed; // Pointer to coastal corner, or null.
    this.watershed_size;

    this.touches = []; // Centers this Corner touches.
    this.adjacent = []; // Adjacent Corners.
    this.protrudes = []; // Edges protruding from this Corner.

    this.equals = function(corner)
    {
        return this.point.x == corner.point.x &&
            this.point.y == corner.point.y;
    }

    this.addCenter = function(center)
    {
        var centerExists = false;
        for(var i = 0; i < this.touches.length; i++)
        {
            if(this.touches[i].equals(center))
            {
                centerExists = true;
                break;
            }
        }
        if(!centerExists)
        {
            this.touches.push(center);
        }
    }

    this.addCorner = function(corner)
    {
        var cornerExists = false;
        for(var i = 0; i < this.adjacent.length; i++)
        {
            if(this.adjacent[i].equals(corner))
            {
                cornerExists = true;
                break;
            }
        }
        if(!cornerExists)
        {
            this.adjacent.push(corner);
        }
    }

    this.addEdge = function(edge)
    {
        var edgeExists = false;
        for(var i = 0; i < this.protrudes.length; i++)
        {
            if(this.protrudes[i].equals(edge))
            {
                edgeExists = true;
                break;
            }
        }
        if(!edgeExists)
        {
            this.protrudes.push(edge);
        }
    }
}
function Edge(index, va, vb, da, db)
{
    this.index = index;

    this.va = va; // First Corner in Voronoi edge.
    this.vb = vb; // Second Corner in Voronoi edge.

    this.da = da; // First Center in Delaunay edge.
    this.db = db; // Second Center in Delaunay edge.

    this.midpoint = {
        x: (this.va.point.x + this.vb.point.x) / 2,
        y: (this.va.point.y + this.vb.point.y) / 2,
    }; // Halfway point between va and vb.

    this.river = 0; // 0 if no river, or volume of water in river.

    this.svg;

    this.equals = function(edge)
    {
        return this.va.equals(edge.va) && this.vb.equals(edge.vb) &&
            this.da.equals(edge.da) && this.db.equals(edge.db);
    }
}