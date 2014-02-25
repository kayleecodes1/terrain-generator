(function() {

	$viewportui = $('#viewport-ui');

	//   START SCREEN   //

	$startscreen = $('#startscreen');
	$setup = $viewportui.find('#setup');
	$startscreen.find('.button-startnewgame').click(function()
	{
		$startscreen.hide();
		$setup.show();
	});

	//   SETTINGS   //

	// Set up the map size settings.
	$mapsizebuttons = $viewportui.find('.map-size button');
	$mapsizebuttons.click(function()
	{
		$mapsizebuttons.filter('.active').removeClass('active btn-warning').addClass('btn-default');
		$(this).addClass('active btn-warning');
	});
	// Set up the party creation.
	$viewportui.find('#partycreation');
	$viewportui.find('.partymember .button-gender').click(function()
	{
		var new_gender = $(this).attr('data-gender') == 'male' ? 'female' : 'male';
		$(this).attr('data-gender', new_gender);
		$(this).html(new_gender == 'male' ? '&#9794;' : '&#9792;');

		var $parent = $(this).parents('.partymember');
		$parent.find('.avatar-male, .avatar-female').removeClass('avatar-male avatar-female').addClass('avatar-'+new_gender);
	});
	// Set up the start game button.
	$('.button-startgame').click(function()
	{
		// Hide the button.
		$(this).hide();

		// Get the map size information.
		$mapsize = $viewportui.find('.map-size button.active');
		var map_size = 'medium';
		if($mapsize.length > 0) { map_size = $mapsize.attr('data-size'); }

		// Move the party panel under the viewport.
		$party = $('.party');
		$party.find('.partymember button').each(function()
		{
			$(this).replaceWith($('<div class="party-gender">'+$(this).html()+'</div>'));
		});
		$party.find('.partymember input').each(function()
		{
			$(this).replaceWith($('<div class="party-name">'+$(this).val()+'</div>'));
		});
		$party.find('.partymember .party-status').html('Healthy');
		$('#content').append($party);
		
		// Hide the settings UI.
		$setup.hide();

		// Hide all UI, also setting up the map overlay.
		$viewportui.hide();
		$viewportui.find('#map-overlay').show();
		$('#map-overlay .button-closemessage').click(function()
		{
			$('#viewport-ui').hide();
		});

		// Start the game.
		var map = new Map(map_size);

		var renderer = new Renderer();
		renderer.init(map);

		var game = new Game(map, renderer);
		game.begin();
	});

})()