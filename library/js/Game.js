function Game(map, renderer)
{
	var _this = this;

	this.map = map;
	this.renderer = renderer;

	this.currentLocation = map.startingLocation;

	// Set up the user's party internally based on the UI elements.
	this.party = [];
	$party = $('.party');
	$partymembers = $party.find('.partymember');
	for(var i = 0; i < $partymembers.length; i++)
	{
		var $pm = $($partymembers[i]);
		this.party.push({
			gender: ($pm.find('.avatar-male').length > 0 ? 'male' : 'female'),
			name: $pm.find('.party-name').html(),
			status: 4,
			el: $pm
		});
	}

	this.timeElapsed = 0; // 24 is a full day. 0 == noon.
	this.travel_speed = 8; // miles per hour

	// A function to handle a keyup event. Turns the travel view off when the
	// escape key is pressed.
	var cancelTravel = function(e)
	{
		if(e.keyCode == 27)
		{
			_this.travelViewOff();
			$('#sidebar-left .options').show();
		}
	}
	// Turns the inspect view off when the escape key is pressed.
	var cancelInspect = function(e)
	{
		if(e.keyCode == 27)
		{
			_this.inspectViewOff();
			$('#sidebar-left .options').show();
		}
	}

	// Start the game.
	this.begin = function()
	{
		// Show the main game controls sidebar.
		$('#sidebar-left, #sidebar-right').show();

		// Update the UI.
		this.updateInfo();

		//   GAMEPLAY OPTIONS   //

		$('#option-inspect').click(function()
		{
			// Hide the other options.
			$('#sidebar-left .options').hide();
			// Notify the player that they can cancel travel with escape.
			$('#sidebar-left .options').after($('<div class="option-reminder">press esc to return</div>'));

			_this.renderer.caravanMarker.hide();
			// Make all centers hoverable and make them display info about themselves.
			for(var i = 0; i < _this.map.centers.length; i++)
			{
				(function(){
					var c = _this.map.centers[i];
					if(!c.border)
					{
						c.svg.attr({'cursor':'pointer'});
						c.svg.hover(function() {
								this.svg.attr({'fill':'#f0ad4e'});
								_this.showPreview(this);
							},
							function() {
								_this.renderer.resetFillColor(this);
								_this.hidePreview();
							}, c, c);
					}
				})()
			}

			// Set up escape key to cancel the travel option.
			$(document).keyup(cancelInspect);
		});

		$('#option-travel').click(function()
		{
			// Hide the other options.
			$('#sidebar-left .options').hide();
			// Notify the player that they can cancel travel with escape.
			$('#sidebar-left .options').after($('<div class="option-reminder">press esc to cancel</div>'));

			_this.renderer.caravanMarker.hide();
			// Make all neighbors of the current location clickable and hoverable.
			for(var i = 0; i < _this.currentLocation.neighbors.length; i++)
			{
				(function(){
					var c = _this.currentLocation.neighbors[i];
					if(!c.border)
					{
						c.svg.attr({'fill':'#cf3823','fill-opacity':0.5,'cursor':'pointer'});
						c.svg.hover(function() {
								this.svg.attr({'fill-opacity':1.0});
								_this.showPreview(this);
							},
							function() {
								this.svg.attr({'fill-opacity':0.5});
								_this.hidePreview();
							}, c, c);
						c.svg.click(function() {
							_this.renderer.caravanMarker.stop();
							_this.renderer.caravanMarker.transform('t0,0');
							_this.travelTo(c);
						});
					}
				})()
			}

			// Set up escape key to cancel the travel option.
			$(document).keyup(cancelTravel);
		});

		$('#option-rest').click(function()
		{
			_this.getEvent('rest');
		});
	}

	// Update the sidebar information for the current location.
	this.updateInfo = function()
	{
		$sidebarleft = $('#sidebar-left');

		var $timeholder = $sidebarleft.find('.time-holder');
		$timeholder.find('.day').html('Day ' + (Math.floor(this.timeElapsed / 24) + 1));
		var time_formatted = (this.timeElapsed % 24);
		var time_period = (time_formatted >= 12 ? 'AM' : 'PM');
		time_formatted = time_formatted % 12;
		$timeholder.find('.time').html((time_formatted == 0 ? 12 : time_formatted)
			+ ':00' + time_period);

		var townPrefix = this.currentLocation.equals(this.map.endingLocation) ? 'The Glorious City of' : 'The Town of ';
		$sidebarleft.find('.location').html(this.currentLocation.town.hasTown ?
			townPrefix + this.currentLocation.town.name :
			this.currentLocation.biome.split('_').join(' ').toLowerCase());
		$sidebarleft.find('.elevation').html(Math.floor(this.currentLocation.elevation * this.map.map_height_scale) + 'm');

		// Also, hide the town marker for the location if it exists.
		if(this.currentLocation.town.hasTown)
		{
			this.currentLocation.town.svg.hide();
		}
	}

	// Show the travel preview for the given Center.
	this.showPreview = function(center)
	{
		$travelpreview = $('#sidebar-right .travel-preview');
		var distance_calculated = Math.floor(Math.sqrt(
			Math.pow(this.currentLocation.point.x - center.point.x, 2) +
			Math.pow(this.currentLocation.point.y - center.point.y, 2)) *
			this.map.map_scale);
		$travelpreview.find('.distance').html(distance_calculated + ' miles');
		$travelpreview.find('.time').html(this.calculateTravelTime(this.currentLocation, center) + ' hrs');

		var townPrefix = center.equals(this.map.endingLocation) ? 'The Glorious City of ' : 'The Town of ';
		$travelpreview.find('.location').html(center.town.hasTown ?
			townPrefix + center.town.name :
			center.biome.split('_').join(' ').toLowerCase());
		$travelpreview.find('.elevation').html(Math.floor(center.elevation * this.map.map_height_scale) + 'm');

		var edge = this.map.lookupEdgeFromCenter(this.currentLocation, center);
		if(edge != null && edge.river) { $travelpreview.find('.river-crossing').show(); }
		else { $travelpreview.find('.river-crossing').hide(); }

		$('.travel-preview').show();
	}

	// Clear the travel preview.
	this.hidePreview = function()
	{
		$('.travel-preview').hide();
	}

	// Travel to the given Center.
	this.travelTo = function(center)
	{
		// Turn off travel view.
		this.travelViewOff();
		if(this.currentLocation.town.hasTown) { this.currentLocation.town.svg.show(); }

		// Update the time.
		var distance_calculated = Math.floor(Math.sqrt(
			Math.pow(this.currentLocation.point.x - center.point.x, 2) +
			Math.pow(this.currentLocation.point.y - center.point.y, 2)) *
			this.map.map_scale);
		var time_calculated = this.calculateTravelTime(this.currentLocation, center);
		this.timeElapsed += time_calculated;

		// Update the current location and animate the caravan marker to the
		// location we are traveling to.
		this.renderer.resetEdges(this.currentLocation);
		this.currentLocation = center;
		this.renderer.colorEdges(this.currentLocation, '#cf3823');
		this.renderer.caravanMarker.animate(
			{'x':this.currentLocation.point.x - 17,'y':this.currentLocation.point.y - 45},
			2000, "easeInOut",
			// When the animation is done, put the marker animation back on
			// loop and show the player's options again.
			function() {
				// Get a random event and display it.
				_this.getEvent('travel');

				$('#sidebar-left .options').fadeIn(600);
				_this.renderer.markerBounce(_this.renderer.caravanMarker);
			});

		// Update the sidebar info.
		this.updateInfo();
	}

	// Turns off the traveling view, that being 
	this.travelViewOff = function()
	{
		// Remove the escape key handler.
		$(document).unbind('keyup', cancelTravel);
		$('#sidebar-left .option-reminder').remove();

		// Clear the travel option graphics.
		_this.renderer.caravanMarker.show();
		for(var i = 0; i < this.currentLocation.neighbors.length; i++)
		{
			var c = this.currentLocation.neighbors[i];

			// Clear the hover and click functions.
			c.svg.unhover();
			c.svg.unclick();

			this.renderer.resetFillColor(c);
			c.svg.attr({'fill-opacity':1.0,'cursor':'default'});
		}

		// Clear the travel preview.
		$('#sidebar-right .travel-preview').hide();
	}

	// Turns off the traveling view, that being 
	this.inspectViewOff = function()
	{
		// Remove the escape key handler.
		$(document).unbind('keyup', cancelInspect);
		$('#sidebar-left .option-reminder').remove();

		// Clear the inspect option graphics.
		_this.renderer.caravanMarker.show();
		for(var i = 0; i < this.map.centers.length; i++)
		{
			var c = this.map.centers[i];

			// Clear the hover and click functions.
			c.svg.unhover();
			c.svg.unclick();

			this.renderer.resetFillColor(c);
			c.svg.attr({'cursor':'default'});
		}

		// Clear the travel preview.
		$('#sidebar-right .travel-preview').hide();
	}

	// Given two Centers, calculate the travel time between them based on
	// distance, elevation difference, terrain types, and party status.
	this.calculateTravelTime = function(center_start, center_end)
	{
		var commonEdge = this.map.lookupEdgeFromCenter(center_start, center_end);
		var distance_calculated = Math.floor(Math.sqrt(
			Math.pow(center_start.point.x - center_end.point.x, 2) +
			Math.pow(center_start.point.y - center_end.point.y, 2)) *
			this.map.map_scale);
		// Base travel time based on distance.
		var time_calculated = Math.floor(distance_calculated / this.travel_speed);
		// Traveling uphill, travel time increases.
		var elevation_difference = center_end.elevation - center_start.elevation;
		if(elevation_difference > 0)
		{
			time_calculated += Math.floor(16 * elevation_difference);
		}
		// Bodies of water add travel time. Crossing rivers also adds travel time.
		if(center_end.water)
		{
			time_calculated += Math.floor((distance_calculated / this.travel_speed) * 0.8);
		}
		else if(commonEdge != null && commonEdge.river)
		{
			time_calculated += 6;
		}
		// Unhealthy party statuses add travel time.
		for(var i = 0; i < this.party.length; i++)
		{
			if(this.party[i].status < 2) { time_calculated += 3 }
			else if(this.party[i].status < 3) { time_calculated += 1 }
		}
		// Return the distance.
		return time_calculated;
	}

	// Get a random event based on the current game state. There is a chance
	// that no event will be selected and the function will return null. The
	// context can be "rest" or "travel".
	this.getEvent = function(context)
	{
		var random_event = null;
		var isChoice = false;

		// Clear the previous event choices.
		$('#viewport-ui #map-overlay .button-eventChoice').remove();

		var newEventButton = function(btnText, fxn, resultText)
		{
			isChoice = true;
			var $el = $('<button type="button" class="btn btn-warning btn-lg button-eventChoice">'+btnText+'</button>');
			$el.click(function() {
				fxn();
				$('#viewport-ui #map-overlay .button-eventChoice').remove();
				$('#viewport-ui #map-overlay .message span').html(resultText);
				$('#viewport-ui #map-overlay .button-closemessage').show();
			});
			$('#viewport-ui #map-overlay .buttons-holder').append($el);
		}

		if(context == 'rest')
		{
			var event_occurs = Math.random();
			// Town events.
			if(this.currentLocation.town.hasTown)
			{
				var which_event = Math.floor(Math.random() * 4);
				// Restful sleep in the town.
				if(which_event == 0)
				{
					_this.timeElapsed += 8;
					random_event = "You find rooms in a local inn and sleep restfully for 8 hours.";
					for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
				}
				// Woken up early by the innkeep.
				else if(which_event == 1)
				{
					_this.timeElapsed += 4;
					random_event = "You find rooms in a local inn but the innkeep wakes your party after 4 hours and tells you to leave.";
				}
				// Person invites you into their home.
				else if(which_event == 2)
				{
					random_event = "A villager invites you into their home to sleep.";
					newEventButton("Accept", function() {
						_this.timeElapsed += 8;
						for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, "You accept their invitation. You sleep restfully in their home for 8 hours.");
					newEventButton("Reject", function() {
						_this.timeElapsed += 4;
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, "You turn down their offer and sleep on the streets of "+_this.currentLocation.town.name+
						" for 4 hours, being woken up early by a group of stray dogs.");
				}
				// Party member killed in sleep.
				else if(which_event == 3 && Math.random() < .2)
				{
					var randomPartyMember = Math.floor(Math.random() * _this.party.length);
					_this.timeElapsed += 8;
					random_event = "Sleeping in the streets of "+this.currentLocation.town.name+
						", "+_this.party[randomPartyMember].name+" was murdered in "+
						(_this.party[randomPartyMember].gender == 'male' ? 'his' : 'her')+" sleep.";
					_this.party[randomPartyMember].status = 0;
				}
			}
			// Random rest events.
			else if(event_occurs < .3)
			{
				var which_event = Math.floor(Math.random() * 3);
				// Bandits attack. A party member is injured.
				if(which_event == 0)
				{
					var randomPartyMember = Math.floor(Math.random() * _this.party.length);
					_this.timeElapsed += 3;
					random_event = "A group of bandits attack while you sleep and "+
						_this.party[randomPartyMember].name+" is badly injured. You barely escape.";
					_this.party[randomPartyMember].status = 1;
				}
				// Choice. Wolves attack in the night.
				else if(which_event == 1 && _this.party.length > 2)
				{
					(function() {
					var randomPartyMember1 = Math.floor(Math.random() * _this.party.length);
					var randomPartyMember2 = randomPartyMember1;
					while(randomPartyMember2 == randomPartyMember1) { randomPartyMember2 = Math.floor(Math.random() * _this.party.length); }
					random_event = "Hearing noises in the night, "+
						_this.party[randomPartyMember1].name+
						" and "+_this.party[randomPartyMember2].name+
						" agree to stand watch. Should they?";
					newEventButton("Yes", function() {
						_this.timeElapsed += 8;
						for(var i = 0; i < _this.party.length; i++) {
							if(i != randomPartyMember1 && i != randomPartyMember2) { _this.party[i].status += 1; }
						}
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, _this.party[randomPartyMember1].name+" and "+_this.party[randomPartyMember2].name+
						" stand watch during the night. They are not well-rested the next morning.");
					newEventButton("No", function() {
						_this.timeElapsed += 5;
						_this.party[randomPartyMember1].status = 0;
						_this.party[randomPartyMember2].status = 1;
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, "You decide the noises are nothing to worry about. The party goes to sleep"+
						" but is attacked in the night by wolves. "+_this.party[randomPartyMember1].name+
						" is killed while warning everyone and "+_this.party[randomPartyMember2].name+
						" is injured. You eventually fend off the wolves.");
					})()
				}
				// Noises in the night.
				else if(which_event == 2)
				{
					_this.timeElapsed += 8;
					random_event = "You hear noises in the night but it turns out to be some"+
						" squirrels and your party sleeps restfully for the rest of the night.";
					for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
				}
			}
			// Default: restful sleep at camp.
			else
			{
				_this.timeElapsed += 8;
				random_event = "You make camp and sleep restfully for 8 hours.";
				for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
			}
		}
		else if(context == 'travel')
		{
			var event_occurs = Math.random();
			// Display a message upon reaching the ending location.
			if(this.currentLocation.equals(this.map.endingLocation))
			{
				random_event = "You've finally reached The Glorious City of " +
					this.map.endingLocation.town.name + "!";
			}
			// Town events.
			else if(this.currentLocation.town.hasTown)
			{
				var which_event = Math.floor(Math.random() * 3);
				// Town greeting!
				if(which_event == 0)
				{
					random_event = "The people of "+this.currentLocation.town.name+" greet you merrily!";
				}
				// Suspicious looks.
				else if(which_event == 1)
				{
					random_event = "The people of "+this.currentLocation.town.name+" give you suspicious looks as you"+
						" enter the town. It might be best to get moving quickly.";
				}
				// Ghost town.
				else if(which_event == 2)
				{
					random_event = this.currentLocation.town.name+" seems like a ghost town as you"+
						" walk down the main street. Not a person in sight.";
				}
			}
			// Ocean events.
			else if(this.currentLocation.ocean)
			{
				if(event_occurs < .3)
				{
					var which_event = Math.floor(Math.random() * 3);
					// Seasickness.
					if(which_event == 0)
					{
						random_event = "The seas are rough and your party suffers seasickness.";
						for(var i = 0; i < _this.party.length; i++) {
							if(_this.party[i].status > 3) { _this.party[i].status = 3; }
						}
					}
					// A storm!
					else if(which_event == 1)
					{
						var randomPartyMember = Math.floor(Math.random() * _this.party.length);
						_this.timeElapsed += 5;
						random_event = "A terrible storm brews as you sail and "+_this.party[randomPartyMember].name+
							" is thrown overboard. You search but cannot find any trace of "+
							(_this.party[randomPartyMember].gender == 'male' ? 'his' : 'her')+".";
						_this.party[randomPartyMember].status = 0;
					}
					// Beautiful dolphins.
					else if(which_event == 2)
					{
						random_event = "You sea a school of dolphins as you sail. So beautiful!";
					}
				}
			}
			// Lake events.
			else if(this.currentLocation.water)
			{
				if(event_occurs < .5)
				{
					var which_event = Math.floor(Math.random() * 2);
					// Mossy lake. Slowed.
					if(which_event == 0)
					{
						_this.timeElapsed += 3;
						random_event = "The lake is very mossy and requires extra time to traverse.";
					}
					// Restful sailing.
					else if(which_event == 1)
					{
						random_event = "The lake is calm and your party has a moment's respite. You are all filled with new hope.";
						for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
					}
				}
			}
			// Random travel events.
			else if(event_occurs < .5)
			{
				var which_event = Math.floor(Math.random() * 10);
				// Party member falls.
				if(which_event == 0)
				{
					var randomPartyMember = Math.floor(Math.random() * _this.party.length);
					random_event = _this.party[randomPartyMember].name+
						" trips and injures themselves, slowing the party.";
					_this.party[randomPartyMember].status = 1;
				}
				// Group comes down with a sickness.
				else if(which_event == 1)
				{
					random_event = "The entire party comes down with a sickness.";
					for(var i = 0; i < _this.party.length; i++) { _this.party[i].status -= 1; }
				}
				// Choice: drink the water?
				else if(which_event == 2)
				{
					random_event = "You come across a spring. Your party is extremely thirsty. Drink from the spring?";
					newEventButton("Yes", function() {
						for(var i = 0; i < _this.party.length; i++) { _this.party[i].status -= 2; }
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, "Your party comes down with a terrible sickness from drinking the water.");
					newEventButton("No", function() {
						for(var i = 0; i < _this.party.length; i++) { if(_this.party[i].status > 1) { _this.party[i].status -= 1; } }
						_this.updatePartyDisplay();
						_this.updateInfo();
					}, "Your party ignores the spring and suffers minor dehydration.");
				}
				// Bandit ambush.
				else if(which_event == 3)
				{
					var randomPartyMember = Math.floor(Math.random() * _this.party.length);
					random_event = "Bandits attack your party and "+_this.party[randomPartyMember].name+" is killed.";
					_this.party[randomPartyMember].status = 0;
				}
				// Scenic route.
				else if(which_event == 4)
				{
					random_event = "You take a scenic route and, while it takes much longer,"+
						" the whole party begins feeling refreshed.";
					for(var i = 0; i < _this.party.length; i++) { _this.party[i].status += 1; }
				}
				else if(which_event == 5)
				{
					random_event = "You see a sign that reads: \"Adventurer's Beware!\""+
						" You should tread carefully in this area.";
				}
				else if(which_event == 6)
				{
					random_event = "A bear leaps out of the bushes and attacks your party."+
						 " You manage to escape without injuries.";
				}
				else if(which_event == 7)
				{
					var randomPartyMember = Math.floor(Math.random() * _this.party.length);
					random_event = _this.party[randomPartyMember].name+" mysteriously drops dead.";
					_this.party[randomPartyMember].status = 0;
				}
				else if(which_event == 8)
				{
					random_event = "A shape rushes from the bushes but you relax when you realize it's just a rabbit.";
				}
				else if(which_event == 9)
				{
					random_event = "An old man offers to escort you to your destination.";
					newEventButton("Accept", function() {
						_this.timeElapsed -= 5;
						_this.updateInfo();
					}, "You accept the man's offer and arrive at your destination much more quickly.");
					newEventButton("Reject", function() {},
						"You turn down the man's offer.");
				}
			}
		}

		if(random_event != null)
		{
			$('#viewport-ui #map-overlay .message span').html(random_event);
			if(!isChoice) { $('#viewport-ui #map-overlay .button-closemessage').show(); }
			else { $('#viewport-ui #map-overlay .button-closemessage').hide(); }
			$('#viewport-ui').show();

			// Update the party and travel info.
			_this.updatePartyDisplay();
			_this.updateInfo();
		}
	}

	// Update the party display based on the current game state.
	this.updatePartyDisplay = function()
	{
		for(var i = 0; i < _this.party.length; i++)
		{
			var status = _this.party[i].status;
			var statusText = "Healthy";
			if(status < 1) {
				statusText = "Dead";
				_this.party[i].el.find('.avatar-male, .avatar-female').
					removeClass('avatar-male avatar-female').addClass('avatar-dead');
			}
			else if(status == 1) { statusText = "Dying"; }
			else if(status == 2) { statusText = "Unhealthy"; }
			else if(status == 3) { statusText = "Normal"; }
			else if(status == 4) { statusText = "Healthy"; }
			else { _this.party[i].status = 5; statusText = "Rested"; }
			_this.party[i].el.find('.party-status').html(statusText);
			if(statusText == "Dead") { _this.party.splice(i, 1); }
		}

		if(_this.party.length < 1)
		{
			$('#viewport-ui').show();
			$('#sidebar-left .options').hide();
			$('#map-overlay button').hide();
			$('#map-overlay .message span').html("Your entire party has died. Better luck next time.");
		}
	}
}