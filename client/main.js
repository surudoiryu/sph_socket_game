var socket; // define a global variable called socket
socket = io.connect(); // send a connection request to the server

var socket = io('http://localhost:2000');
/*socket.on('connect', function (data) {
    console.log("test");

  });
*/
//this is just configuring a screen size to fit the game properly
//to the browser
canvas_width = window.innerWidth * window.devicePixelRatio;
canvas_height = window.innerHeight * window.devicePixelRatio;

//make a phaser game
game = new Phaser.Game(canvas_width,canvas_height, Phaser.CANVAS, 'gameBoard');

//the enemy player list
var enemies = [];

var gameProperties = {
	//this is the actual game size to determine the boundary of
	//the world
	gameWidth: 4000,
	gameHeight: 4000,
	game_element: "gameBoard",
	in_game: false,
};

// this is the main game state
var main = function(game){
};

main.prototype = {
	preload: function() {
		//Set the gameboard ready to be gamed on.
		game.stage.disableVisibilityChange = true;
		game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
		game.world.setBounds(0, 0, gameProperties.gameWidth, gameProperties.gameHeight, false, false, false, false);
		//I’m using P2JS for physics system. You can choose others if you want
		game.physics.startSystem(Phaser.Physics.P2JS);
		game.physics.p2.setBoundsToWorld(false, false, false, false, false);
		//sets the y gravity to 0. This means players won’t fall down by gravity
		game.physics.p2.gravity.y = 0;
		// turn gravity off
		game.physics.p2.applyGravity = false;
		game.physics.p2.enableBody(game.physics.p2.walls, false);
		// turn on collision detection
		//game.physics.p2.setImpactEvents(true);
  },
	//this function is fired once when we load the game
	create: function () {
		game.stage.backgroundColor = 0xE1A193;
		console.log("client started");
		//listen to the “connect” message from the server. The server
		//automatically emit a “connect” message when the cleint connets.When
		//the client connects, call onsocketConnected.
		socket.on("connect", onsocketConnected);
		//listen for main player creation
		socket.on("create_player", createPlayer);
		//listen to new enemy connections
		socket.on("new_enemyPlayer", onNewPlayer);
		//listen to enemy movement
		socket.on("enemy_move", onEnemyMove);

		// when received remove_player, remove the player passed;
		socket.on('remove_player', onRemovePlayer);

		//when the player receives the new input
		socket.on('input_recieved', onInputRecieved);

		//when the player gets killed
		socket.on('killed', onKilled);
		//when the player gains in size
		socket.on('gained', onGained);

		// check for item removal
		socket.on ('itemremove', onitemremove);
		// check for item update
		socket.on('item_update', onitemUpdate);
	},
	update: function () {
		// emit the player input
		//move the player when he is in game
		if (gameProperties.in_game) {
			// we're using phaser's mouse pointer to keep track of
			// user's mouse position
			var pointer = game.input.mousePointer;

			//Send a new position data to the server
			socket.emit('input_fired', {
				pointer_x: pointer.x,
				pointer_y: pointer.y,
				pointer_worldx: pointer.worldX,
				pointer_worldy: pointer.worldY,
			});
		}
	}

}

// this function is fired when we connect
function onsocketConnected () {
	console.log("connected to server");
	//create a main player object for the connected user to control
	//createPlayer();
	gameProperties.in_game = true;
	// send to the server a "new_player" message so that the server knows
	// a new player object has been created
	socket.emit('new_player', {x: 0, y: 0, angle: 0});
}


//////////////////////GAME LOGICS////////////////////////

//the “main” player class in the CLIENT. This player is what the user controls.
//look at this example on how to draw using graphics https://phaser.io/examples/v2/display/graphics
// documenation here: https://phaser.io/docs/2.6.2/Phaser.Graphics.html

function createPlayer (data) {
	console.log("creating player...");
	//uses Phaser’s graphics to draw a circle
	player = game.add.graphics(0, 0);
	player.radius = data.size;

	// set a fill and line style
	player.beginFill(0xffd900);
	player.lineStyle(2, 0xffd900, 1);
	player.drawCircle(0, 0, player.radius * 2);
	player.endFill();
	player.anchor.setTo(0.5,0.5);
	player.body_size = player.radius;
	//set the initial size;
	player.initial_size = player.radius;

	// draw a shape
	game.physics.p2.enableBody(player, true);
	player.body.clearShapes();
	player.body.addCircle(player.body_size, 0 , 0);
	player.body.data.shapes[0].sensor = true;
	//enable collision and when it makes a contact with another body, call player_coll
	player.body.onBeginContact.add(player_coll, this);

	//We need this line to make camera follow player
	game.camera.follow(player, Phaser.Camera.FOLLOW_LOCKON, 0.5, 0.5);
}


// When the server notifies us of client disconnection, we find the disconnected
// enemy and remove from our game
function onRemovePlayer (data) {
	console.log("removing player");
	var removePlayer = findPlayerById(data.id);
	// Player not found
	if (!removePlayer) {
		console.log('Player not found: ', data.id)
		return;
	}

	removePlayer.player.destroy();
	enemies.splice(enemies.indexOf(removePlayer), 1);
}


// this is the enemy class.
var remote_player = function (id, startx, starty, startSize, start_angle) {
	this.x = startx;
	this.y = starty;
	//this is the unique socket id. We use it as a unique name for enemy
	this.id = id;
	this.angle = start_angle;

	this.player = game.add.graphics(this.x , this.y);
	this.player.radius = startSize;

	// set a fill and line style
	this.player.beginFill(0xffd900);
	this.player.lineStyle(2, 0xffd900, 1);
	this.player.drawCircle(0, 0, this.player.radius * 2);
	this.player.endFill();
	this.player.anchor.setTo(0.5,0.5);

	//we set the initial size;
	this.initial_size = startSize;
	//we set the body size to the current player radius
	this.player.body_size = this.player.radius;
	this.player.type = "player_body";
	this.player.id = this.id;

	// draw a shape
	game.physics.p2.enableBody(this.player, true);
	this.player.body.clearShapes();
	this.player.body.addCircle(this.player.body_size, 0 , 0);
	this.player.body.data.shapes[0].sensor = true;
}

//Server will tell us when a new enemy player connects to the server.
//We create a new enemy in our game.
function onNewPlayer (data) {
	console.log(data);
	//enemy object
	var new_enemy = new remote_player(data.id, data.x, data.y, data.size, data.angle);
	enemies.push(new_enemy);
}

//Server tells us there is a new enemy movement. We find the moved enemy
//and sync the enemy movement with the server
function onEnemyMove (data) {
	console.log(data.id);
	console.log(enemies);
	var movePlayer = findPlayerById (data.id);

	if (!movePlayer) {
		return;
	}

	var newPointer = {
		x: data.x,
		y: data.y,
		worldX: data.x,
		worldY: data.y,
	}

	//check if the server enemy size is not equivalent to the client
	if (data.size != movePlayer.player.body_size) {
		movePlayer.player.body_size = data.size;
		var new_scale = movePlayer.player.body_size / movePlayer.initial_size;
		movePlayer.player.scale.set(new_scale);
		movePlayer.player.body.clearShapes();
		movePlayer.player.body.addCircle(movePlayer.player.body_size, 0 , 0);
		movePlayer.player.body.data.shapes[0].sensor = true;
	}

	var distance = distanceToPointer(movePlayer.player, newPointer);
	speed = distance/0.05;

	movePlayer.rotation = movetoPointer(movePlayer.player, speed, newPointer);
}

//we're receiving the calculated position from the server and changing the player position
function onInputRecieved (data) {

	//we're forming a new pointer with the new position
	var newPointer = {
		x: data.x,
		y: data.y,
		worldX: data.x,
		worldY: data.y,
	}

	var distance = distanceToPointer(player, newPointer);
	//we're receiving player position every 50ms. We're interpolating
	//between the current position and the new position so that player
	//does jerk.
	speed = distance/0.05;

	//move to the new position.
	player.rotation = movetoPointer(player, speed, newPointer);

}

//This is where we use the socket id.
//Search through enemies list to find the right enemy of the id.
function findPlayerById (id) {
	console.log("find player: "+id);
	for (var i = 0; i < enemies.length; i++) {
		if (enemies[i].id == id) {
			return enemies[i];
		}
	}
}

//new function: This function is called when the player eats another player
function onGained (data) {

	//get the new body size from the server
	player.body_size = data.new_size;
	//get the new scale
	var new_scale = data.new_size/player.initial_size;
	//set the new scale
	player.scale.set(new_scale);
	//create new circle body with the raidus of our player size
	player.body.clearShapes();
	player.body.addCircle(player.body_size, 0 , 0);
	player.body.data.shapes[0].sensor = true;
}

//destroy our player when the server tells us he's dead
function onKilled (data) {
	player.destroy();
}




// wrap the game states.
var gameBootstrapper = {
    init: function(gameContainerElementId){
			game.state.add('main', main);
			game.state.start('main');
    }
};;

//call the init function in the wrapper and specifiy the division id
gameBootstrapper.init("gameBoard");
