# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- You can shoot at any time now, except while climbing. In a slide the gun stayed down until the slide was over; now it comes up at once and fires. Rolling over while lying down no longer stops you either, and a single press of the trigger while sprinting is no longer lost: the shot goes off as soon as the gun is up.
- Gun Game: the ammo never runs out. You still reload, and the ammo counter shows ∞ instead of the reserve.
- Gun Game: the stab that wins the match is played out as a finisher. Whoever makes it, you or a bot, does one of the finishers done with a knife to whoever it is, picked at random from those that have room there, and the knife in it wears the skin the winner's knife has. The rest of the match stands still meanwhile; the win counts once the scene is over. In a network match everybody sees the same scene: the computer the victim plays on picks it and tells the others.
- Gun Game: every new weapon also gets a sight picked at random from the ones it takes; handguns always keep their iron sights.
- Mounting lying down. Prone you can rest the gun on what is about as high as your eyes (sandbags, a low wall, a step), propping yourself up by a hand's breadth at most, and lean out past the edge of a wall; anything higher stays a wall you lie behind.
- Reloading while you sprint: you keep running and the reload plays as you go. Out of a tactical sprint you drop to a plain sprint for it (going back into a tactical sprint still cancels a reload that isn't done).
- The kick: every round slams the gun straight back at you and it springs forward again, sharply, a light gun a little and a heavy one hard. From the hip it slams back about half as far again as when you aim: hip fire hits hard, aimed it is a little calmer. Aimed, the muzzle hardly rises any more, so the sights stay on the target instead of the barrel coming up over it; from the hip it still rises a little. Where the shots go is unchanged.
- Wingman is now about one flag instead of the points A and B. Ten seconds in its circle take it, for players and bots alike and however many of a team stand in it; with both teams in it nothing moves. Once a team holds the flag, the others have one minute to take it back, or the holders win; taking it back starts the minute again for the other side. A match always lasts eight minutes, the minute never changes that, and whoever holds the flag when the time is up wins (if nobody does, the kills decide).
- Under the score the flag shows that minute: "HALTEN" in blue while it is yours, a red "ZURÜCKEROBERN" while it isn't, flashing in the last 15 seconds, and below it the seconds a taking still needs. The flag on the pole carries a star instead of a letter.
- Bots go for the flag together: both of a team take it, stay in the circle to hold it, and go back for it when the others have it.
- All eleven maps now have Wingman, PoolDay too. On each the flag stands in the middle of the map, where every way meets: both teams run the same distance to it, no spawn can see it, and there is cover in the circle and room round it. It stands on the rug stand in the domed market hall on Sirocco, round the centrepiece on the floor of the atrium on Atrium, between turbine and generator in the turbine hall on Dynamo, in the glass server room in the middle of the lab on Blacksite, on the fountain in the piazza on Citadel, between two pillars of the pillar hall in the Backrooms, on the warehouse floor under the bridge on Drydock, in the brook below the weir on Millrace, at the summit cross on Cornice (the flag flies from the cross), between the escalators of the transfer hall on Nightline, and on PoolDay down in the middle of the empty pool, in the open.
- The circle only shows where standing counts: it no longer runs through walls, crates or roofs, doesn't hang over drops and follows steps.
- Maps: on Dynamo the turbines now stand 3 m apart from their generators, a way across the turbine hall where the flag stands, and a covered conveyor gallery joins the coal shed and the transfer tower; you can climb onto it, and from there onto the shed roofs. On Drydock two new containers on the quay, in place of a concrete barrier, and a container in the yard in front of each big warehouse door, so nobody looks in from the spawn yard. On Blacksite a container on each side of the helipad, a crate stack at each lab corner, and the racks of the glass server room now stand by its doors, so bots no longer get stuck at its glass walls. A few spawns moved on Sirocco, Atrium, Blacksite, Citadel, Dynamo and Drydock, so that none looks at the flag; on PoolDay, Wingman leaves out the spawns that look into the pool hall.
- Nightline, Millrace and Cornice: the invisible blocks over roofs and machines are gone. You can now climb onto the parked train, the kiosk, the ticket booth and the machines on Nightline; the truck cabs, the office roofs and the woodcutters' huts on Millrace; and the snowcats, the tiled stove and the wood shed on Cornice. Only where standing up there would put you inside something that is just drawn (the roofs of the saw hall and of the hut, the frame saw, the cable car drive) the way up stays shut.
- Both computers need this version to play together; the lobby says so if another one is on the network.

### Fixed

- Iron sights no longer hide what you aim at. On every gun the rear sight was a solid block with a notch only painted on, right on the line of sight, and on the AR-77 and the KR-3 a solid plate sat in front of the rear ring, so a soldier you aimed at disappeared behind the sight. Now every rear sight is an open notch (a real ring on those two), the tip of the front post marks where the shot goes, and the target stays in view above and around it. On the HMG-90 and the MK-14 the front post now reaches the line of sight, and on the Breacher-12 the line of sight runs above the rail instead of through it.
- Aiming, the empty casings flew up slowly over the middle of the picture and seemed to hang there, like parts of the gun flying about; now they fly out to the right and fall. On the AR-77 and the KR-3 the ears beside the rear ring stood loose next to its base, two bars in the air when you aimed; they now stand on a bridge across it.
- Aimed through the prism, the TAC-3 or the thermal sight, the eyepiece came back into your face with every shot and you could no longer see through it. Behind these sights the gun now slams back half as far, and the eyepiece always stays a few centimetres in front of your eye.
- Longbow .338: scoping in or out while the bolt was being worked, the right arm came up in front of the eye and filled the whole picture, and from the hip the forearm swept up across the right of it. Now the gun comes off the eye while the bolt is worked and goes back up as it closes, and the fist takes the bolt with its forearm running down and out of the picture.
- Wingman: everyone standing in the circle counts. Before, some spots in a circle didn't: in the Backrooms, 14 of the 32 standing spots in the circle of point B.
- Citadel: the strip behind the terrace kiosk was a 3 m deep pit you could fall into and never get out of.
- Millrace: from the crane walkway you could get onto the roof of the planing shed by the timber landing and see both teams' spawns from there. The shed is now solid up to its roof, out of reach. You also no longer stand inside the office roofs, and the invisible ledge high above the offices is gone.

## [0.6.0] - 2026-11-03

The Wingman update: a new mode for 2 against 2, six new maps, bodies that fight as they fall, and a game that runs on very weak computers too.

### Added

**Bodies that fight as they fall**
- A soldier hit for the last time no longer topples over like a board. For a moment the body still fights: it staggers a step or two to keep its balance, a hand goes to a wound in the chest or the belly, the knees give, the arms reach for the ground it falls toward, and the chin tucks when it goes over backwards. Once it is down, a leg draws up one last time, then the muscles let go and it lies still.
- The hit decides how a body falls: a head shot drops it where it stands, a shotgun or a heavy rifle up close throws it off its feet, a shot in the back pitches it forward, a runner stumbles on and catches itself on its hands, a shot leg buckles first, and a shot arm hangs. Shot in front of a wall or a fountain, it slides down it and slumps.
- The body bends at the waist and the neck now, its joints stop where real ones do (knees and elbows only one way, the hips not backwards), and it weighs what a soldier in gear weighs: a heavy torso, light hands. On the ground it slides with real friction and then lies still instead of trembling. Boots that stood a little in the floor no longer kick the body up.

**Wingman**
- A new mode for 2 against 2: you and a bot against two bots, or players together over the local network. Two points, A and B, stand on the map, each a circle with a flagpole in the middle.
- Stand in a circle to take it: 10 seconds alone, about 7 with your teammate. With both teams in the circle nothing moves, and a half-taken point slowly falls back when everybody leaves it. The owners standing on their point undo what the others had started.
- The team that holds both points at the same time wins at once. After 7 minutes, the team with more kills wins. Respawns never run out, and you always come back at your own base.
- The flag of whoever is taking a point climbs the pole, the owner's flag flies at the top, in blue for your team and red for the others. Both points show under the score, as markers over the map (held at the edge of the screen when they are off to the side or behind you), and on the minimap. Standing in a circle shows how far the taking has come, or that it is contested.
- Bots play for the points: with both points open the two of a team split up, the last one they take together, and whoever is closer runs back when the others start taking one of theirs. On a point they hold it instead of chasing every shot they hear, and when the others are in the circle too they go round and look for them.
- On Millrace, Cornice and Nightline, built for the mode, and on Sirocco, Atrium, Dynamo, Blacksite, Citadel, Backrooms and Drydock. Every point was measured so that both teams walk the same distance to it and no spawn can see it. On Blacksite one point is up on the guard tower and the other one around the helicopter; on Sirocco the flags stand on the dome of the cistern and of the well. PoolDay is too small for the mode.
- In multiplayer the vote decides on bots as usual: with bots it is 2 against 2, without them only the players play, so two of you play 1 against 1. The computer that runs the bots decides the points and tells everybody else, and someone who joins a running match sees how they stand.

**Six new maps** for Team Deathmatch, Free for All, Gun Game and Wingman, each with its own layout, mirror-symmetric so both teams get the same ways:
- **Sirocco**: a walled caravan town in the desert in the late afternoon. A domed market hall in the middle with a door on every side, the well square with a tea house terrace, a caravanserai with a gallery on its arcade roofs, houses you run through and flat roofs connected by a bridge over the street.
- **Atrium**: an office building on a weekday evening, two floors around a glass-roofed lobby with a gallery. Open-plan offices with cubicles, a server room and a boardroom behind glass, storage, a canteen, loading yards with an outside stair, and a service alley and a forecourt as flanks.
- **Dynamo**: a coal-fired power station at dusk. The turbine hall with two turbine sets as long cover, catwalks along its walls and a bridge across, the coal yard with a heap you can climb, the switchyard with its control house and transformers, and pipe yards with water tanks. The teams start north and south instead of west and east.
- **Millrace**: a sawmill on a mill stream in a pine forest in the morning mist, built for Wingman. Point A is in the saw hall over the stream around the frame saw, with a loft above it, point B on the timber landing by the jetty under the crane walkway. Between them a footbridge and a weir, and the stream bed is the low way from one point to the other.
- **Cornice**: the top station of a cable car and a mountain hut on a snowy saddle at sunset, built for Wingman. Point A is up on the gondola deck of the station, reached through the ski depot underneath or the outside stair; point B is in the hut's parlour around the tiled stove, with a terrace in front and a balcony above. The summit rock with its cross stands in the middle, and you can climb it from every side.
- **Nightline**: the terminus of metro line 69 at night, after the last train, built for Wingman. Point A is on the platform in front of the parked train, which you can run through; point B is in the ticket hall behind the turnstiles. Between them the transfer hall, with a bridge across it and escalators up to the bridge.
- Bots now take stairs and climb ledges from both sides on every map, not only on the new ones.

**Graphics: Toaster and Auto**
- A new graphics level for very weak computers, **Toaster**: a smaller picture that dynamic resolution moves between 35 and 75 percent, simple bodies at almost any distance, no shadows and no extra lights, a sky without clouds, fewer particles and bullet holes, smaller weapon skins and a minimap that is drawn less often. Its target is a steady 30 to 45 frames instead of 60.
- **Auto**, the new default, picks the level from the graphics chip when the game starts: Toaster without a usable chip or on very old ones, Niedrig on most Intel HD and UHD chips and older AMD ones, Mittel on everything else. With two processor cores or 2 GB of memory it goes one level lower. If the game still runs slowly with the smallest picture, it starts one level lower next time and says so. Hoch is only ever your own choice.
- The settings show what Auto picked and on which chip, and a new level can be applied right away from the main menu.
- The Windows version now also starts on a computer with no usable graphics chip at all: the processor draws the picture then, and Auto picks Toaster.

### Changed

Performance, measured against 0.5.0 in the same conditions:
- Soldiers that are small on screen are drawn as a simple body: plain boxes and tubes in the colours of their uniform, one draw call instead of about eleven and a tenth of the triangles, with their gun in one piece as well. How small depends on the graphics level and the screen, and in a scope the magnified picture counts. On Mittel they switch somewhere between 13 and 20 meters, where you can't tell the two apart.
- Up close, small parts like laces, webbing and rails are plain boxes now, the guns in other soldiers' hands are built lighter, and all the blob shadows under the soldiers are one draw call.
- The gun in your hands has materials of its own, so the graphics card no longer has to switch a material between two scenes several times a frame. See-through things that are flat or glow (tracers, the shadows at the foot of walls, water) are drawn in one pass instead of two.
- The HUD only writes to the page when a value changes, and checks who can be seen for the name tags a few times a second instead of every frame.
- Less garbage for the memory cleanup every frame: the animation of the soldiers and the ragdolls reuse their scratch values.
- Loading: the soldiers in one uniform share their geometry, the weapon skins are painted when a match needs them instead of at the start, and your own body and guns for the death camera are built while the match loads, not at your first death. In Warzone the finisher scenes are prepared while the plane flies.
- Together, with a processor slowed to a quarter of its speed, Drydock now runs at 159 instead of 109 frames per second, and a frame takes 3.8 instead of 6.9 milliseconds of game code; at a sixth, at 147 instead of 75. Drawn by the processor alone (no graphics chip) on Mittel, 52 instead of 7 frames. Warzone runs at 144 instead of 118 frames and loads in 9.7 instead of 15.1 seconds, Drydock in 2.0 instead of 4.6.
- Dynamic resolution has targets per graphics level and goes further down on the weak ones. On screens with display scaling above 100 percent, Mittel draws at most at 150 percent and Niedrig and Toaster at 100 percent, so a sharp laptop screen doesn't quietly cost twice the work.
- Both computers need this version to play together: 0.5.0 and 0.6.0 don't mix, and the lobby says so.

**Maps**
- The light in the Backrooms is softer: shadows have soft edges, the dark part fades in at its doorways, and the red room blends into the yellow halls around it instead of ending at a hard line.

### Fixed

- The hands of other soldiers now close round the grip and the handguard of every gun. Before, each hand sat a few centimeters below its grip, and on pistols the hands held the gun from underneath. On long guns the support shoulder comes forward a little when the handguard is just out of reach.
- A hurt bot that went into cover while you could still see it crouched there without shooting until it died. Now it shoots back on its way into cover, and when the cover doesn't hide it, it fights it out.
- Under a low ceiling the Wingman flagpole now stops just below it. In the Backrooms it went through the ceiling, and on Millrace the flag of point A flew above the roof of the saw hall, out of sight from inside.
- Pressed against the edge of a wall, a crate or a car, you could end up a few centimeters inside it and from there walk straight through it. Now the edge stops you, and backing out, sliding along it and jumping work as before.
- Cars and trucks on every map have their wheels turned the right way instead of sticking out of the bodywork, and forklifts are solid wherever they stand, mast included.
- Dynamo: the turbine hoods lay crosswise through the hall; now they sit on their turbines and are solid. The bulldozer cab is solid, and an invisible low block between two insulators is now a plinth you can see. Blacksite: you could walk and shoot through the helicopter's tail at head height. Sirocco: nobody stands inside or shoots through the domes over points A and B any more, and shots pass under the handcarts.
- Millrace: the weir moved a little away from the bridge, so you no longer bump your head walking along the stream, and the sawdust heap is solid. Cornice: the folded parasol is solid, and the panelling of the hut no longer runs across its doors. On both maps the invisible blocks that keep you off roofs and machines no longer stop bullets.
- The arches in the Backrooms stop shots along their whole edge, and on the island a cover pile no longer lands inside the parked car in the eastern hamlet.
- PoolDay printed a warning for a texture it doesn't have.
- The README and the README.txt of the Windows version named the wrong folder for its settings. It is `%APPDATA%\Black Warfare 69`.

## [0.5.0] - 2026-11-02

The Backrooms update: a new map, a Windows version, a browser version without a server, and smoother multiplayer. Nothing needs to be installed any more, Node.js included.

### Added

**Windows version**
- The game as a Windows program: extract the zip and double-click `Black Warfare 69.exe`. It brings its own browser engine and Node.js along (Electron), so nothing needs to be installed.
- Its own window that starts maximized, `F11` for full screen, and **BEENDEN** in the main menu to quit. A running match asks before the window closes.
- The multiplayer server is built in: host a room or join one, and browsers on other computers can join it through the address the lobby shows.
- On laptops with two graphics chips it uses the stronger one.

**Browser version without a server**
- The browser download is now a single page: double-click `index.html` and the game runs straight from the disk, alone against bots, with no server and no internet connection. PoolDay's map file and the fonts are packed inside it.
- `start.bat` still runs the server for multiplayer if Node.js is installed. Without Node.js it explains the other ways instead of stopping there.

**Backrooms**
- A new map for Team Deathmatch, Free for All and Gun Game, after the Backrooms of internet legend: yellow wallpaper, damp carpet and fluorescent panels in a low suspended ceiling. Compact at 48 by 40 meters.
- Its parts are the oddities of the legend's "Level 0": a pillar hall, pale rooms with arched doorways and windows, the red room, an office with half-height partitions, a room with holes in the floor that nobody comes back from, and a part where the lights have gone out.
- Two spawn halls and a maze of partitions between them; no line of sight runs from one spawn to the other. Both halves mirror each other.
- The light is worked out once when the map loads: pools of light under the panels, red light out of the red room, a few dead panels, some that flicker. The hum of the tubes follows the light and falls silent in the dark.
- Small things on the walls and ceiling: wall sockets, air vents, a missing tile here and there, damp stains on the carpet.

**Multiplayer**
- The scoreboard shows everybody's ping in network matches.

### Changed

- Smoother movement of the others over the network: every position carries the time it was true, and the others play it back at the pace it really happened instead of the moment it arrived. On a wobbly Wi-Fi this took the jitter of the others' movement down to less than a tenth in our tests. When a message is late, the body keeps moving for a moment instead of freezing.
- The others are shown closer to the present: about 65 ms behind on a cable instead of 110 ms, and the delay grows on its own only as far as the network needs it to.
- Bots send their state 20 times a second instead of 10.
- Everything a computer says in one moment goes out as one message, and the server sends out what it has for each player in one packet. On a slow line, outdated positions are skipped instead of piling up.
- Loading over the network: a browser that already has a file only checks whether it changed, and code goes out compressed (three.js at a fifth of its size).
- The two fonts come with the game. It makes no requests to Google or any other server any more.
- The main menu shows the five maps in one row, down to a 1280-pixel-wide window.
- Both computers need this version to play together: 0.4.0 and 0.5.0 don't mix, and the lobby says so.

### Fixed

- PoolDay: thin parts like the stall walls, chair backs, urinals and shower heads had gaps in their collision, so bullets and bodies could pass through in places. Tops nobody could stand on properly, like the tops of stall walls and lockers under the low ceiling, could be climbed onto and got you stuck; they can't any more.
- Somebody pushed by others could end up a few centimeters inside a wall or a chair and then walk right through it. Nobody is pushed into anything now, on every map.
- A bot that respawned close to a wall could start a few centimeters inside it.
- A player who falls out of the world now dies, instead of falling forever.

## [0.4.0] - 2026-11-01

The Gun Game update: a new mode, a new map straight from a Counter-Strike 1.6 map file, and six weapon skins.

### Added

**Gun Game**
- A new mode on all four maps, solo with bots and in the multiplayer vote. Everyone for themselves: every kill gives you the next weapon.
- 15 levels: 14 guns from the P-11 Sidearm up to the Titan .50, then the knife. A kill with the knife wins the match. It takes two stabs on someone at full health, or one on a bot from behind.
- A knife kill below the last level doesn't move the killer up, it costs the victim a level. Killing yourself costs a level too.
- Every new weapon comes with a random skin, the standard look included.
- The HUD shows your level, the next weapon and who is ahead. The scoreboard shows everyone's level and weapon.
- Bots climb the same ladder and come at you with the knife on the last level. Someone who joins a running match over the network starts at level one.

**PoolDay**
- The Counter-Strike 1.6 map by Squall as the fourth map for every mode except Warzone. It isn't rebuilt: the game reads the original map file with its walls, textures, baked light, solid parts, spawn points and stall doors.
- The pool in the middle is empty, so you jump in and climb back out. The whirlpool still has its water.
- The stall doors open when someone walks up to them and shut again behind them. `F` at a urinal flushes it, and the others hear it too.
- Bots know their way around, in and out of the pool.
- Nothing lies on the floor: you bring your loadout, the original's weapons on the ground aren't used.

**Weapon skins**
- Six skins next to the standard look: Glutglas, Riss, Magenta, Plasma, Flüssigchrom and Neonader. They are painted in code and fitted to each weapon, so lenses, glass and reticles stay clear.
- Every weapon has its own skin in the loadout menu, picked with a row of small buttons under the optics. The menu's 3D preview shows it.
- In Warzone every weapon on the ground comes with a random skin, all seven looks equally likely, and its card names it. A weapon keeps its skin when it's dropped and picked up again.
- Everyone sees the skins of the others, on bots and over the network as well.

### Changed

- The knife no longer kills another player with one stab from behind. Players take the same damage from any side. Bots outside Warzone still die to one stab from behind.
- Both computers need this version to play together: 0.3.0 and 0.4.0 don't mix, and the lobby says so.

## [0.3.0] - 2026-10-31

The multiplayer update: play every mode with your friends over the local network, on any network and any PC.

### Added

**Multiplayer over the local network**
- A Multiplayer button in the main menu. Pick a name and the game looks for a room on your network. The first player opens it, everybody after that lands in it automatically.
- Nobody runs the room: everybody votes on the mode (Team Deathmatch, Free for All or Warzone), the map and whether bots fill the free slots. The lobby has a chat.
- All three modes with bots or without. Bots keep running if the player they ran on leaves.
- Warzone with shared loot, chests, vehicles, gas and finishers on other players. After you die you can watch the others.
- Join a running Team Deathmatch or Free for All at any time, or leave it and come back with your score.
- If the computer with the room goes away, the others find a new room by themselves.

**Any local network and any PC**
- Computers find each other on networks that drop announcements between devices, which many Wi-Fi routers do. They also ask each other one by one and keep looking while you wait in the lobby.
- A firewall doesn't leave you stuck on "searching". If the room you find can't be reached, you get a room of your own, and as soon as one computer lets others in you end up together by yourselves: a room nobody can get into gives way to one that works.
- The lobby says what is wrong: your own firewall, another computer that lets nobody in, or another version of the game on the network.
- On Windows the lobby offers a **FREIGEBEN** button when the firewall keeps others out, also on networks set to "public". One click, Windows asks once, and the rule only covers devices in your own network.
- The lobby shows the addresses that actually work and skips virtual network cards and VPNs. A bare cable between two computers and phone hotspots work too.
- A laptop that changes networks or gets a new address stays reachable.
- Bots run on a computer that can carry them, not simply on the first one in the room. If the one running them takes too long to load a match, another one takes them over at the start, so nobody stands on an empty map. A slow computer still comes in when it has finished loading.
- `start.bat` explains what to do if Node.js is missing, opens the page itself, and doesn't trip over a window left open. If another program uses port 8069, the game takes the next free one.
- A browser without WebGL 2 gets an explanation instead of a technical error.

**Bot finishers on every player**
- In a Warzone match bots now finish all players, not only the one whose computer runs them. One bot comes over to someone lying on the ground and the others leave that player alone. The player sees the scene through the film camera, everyone else sees the same scene from outside, and the body stays where the scene leaves it. From outside the sounds of a finisher now come from where it happens, and a grenade finisher shows its blast.

### Changed

**Fairer finishers in Warzone**
- A player can now only be finished from behind, by bots and by other players alike: on their feet when their health is low enough, on the ground as well. Before, a low enough player could also be finished from the front, and someone lying down from any side.
- A bot walks around someone lying on the ground to get to their back. If that player keeps facing it or has a wall behind them, the bot gives up and shoots instead.
- Bots can still be finished from any side once they are hurt enough.

## [0.2.0] - 2026-10-31

The Warzone update: a battle royale mode on a new island, finishers that work both ways, and a much bigger arsenal.

### Added

**Warzone**
- A battle royale for 20 players (you and 19 bots) on Serena, a new island with a town, a harbor, an airfield, a military base, villages and mountains.
- Jump out of the plane, skydive, steer the parachute and shoot your sidearm on the way down.
- A transport plane that looks like one: a four-engine high-wing freighter with real proportions, an upswept tail, wheel sponsons, external fuel tanks, spinning propellers with blurred discs, navigation lights and strobes, an open cargo ramp with a red-lit hold, and painted panel lines, camouflage and markings. The look is low-poly with small painted textures.
- You leave over the ramp at the plane's speed, and the camera flies from behind the plane into your head without a stop or a snap. Your arms come up into the picture at the end. Bots leave over the ramp as well.
- Opening the parachute is an animation: your hand goes for the handle and pulls it, the lines run out, the ram-air canopy fills, your body swings upright with the view, and your speed drops gradually. The automatic opening starts earlier when you dive fast, so you are always under the canopy before the ground.
- A safe zone that shrinks in stages. Outside it you lose health.
- Loot: 170 chests and 280 items on the ground. Any weapon can come with any optic, in five rarity levels from Common to Legendary.
- Weapons you swap out and the loot of dead bots fly with real collision, bounce off walls and floors, and come to rest where they can be picked up.
- Armor plates: carry up to 5 and wear up to 3, with a plate animation in first person.
- Five drivable vehicles: hatchback, sedan, pickup, jeep and off-roader.
- Going down instead of dying right away, with crawling, bleeding out and a self revive.
- Bots that loot, fight each other and go after you as the zone closes in.
- A full map with place names, the current zone and the next one.

**Finishers**
- 26 staged finishers, 14 on standing enemies and 12 on enemies lying on the ground. Press `V` next to a hurt enemy: from behind, from the front if they are low enough, and from any side if they are down.
- Each one is a short scene with its own camera that returns to first person at the end.
- Bots use the same scenes on you, and you watch it from the scene's camera instead of just dying. Your body stays where the scene leaves it.
- If you are down and a bot has seen you nearby, it stops shooting, walks over and finishes you by hand. Only one comes at a time, and the others hold their fire. You can still get back up if it hasn't reached you yet.
- A bot right next to you also does it when you are nearly dead on your feet, or when you are down and it lands the last shot from right beside you.
- The scene turns and moves over a little until it fits where you are. In a room too tight for any scene, the bot shoots you instead.

**Weapons**
- Five new weapons: KR-3 Triad, PX-4 Hornet, Titan .50, Siege-8 and M-50 Bastion.
- Nine new optics, including 2x to 12x scopes and thermal sights.
- Weapon rests: aiming against an edge steadies the weapon. At corners you lean out.

**Interface**
- A compact card directly above whatever you look at, with the name, rarity and a picture of the item, and a colored outline around the item itself.
- The minimap shows the floor plan of a building from the inside, for every floor, with the floor's name. It zooms in when you enter and back out when you leave.

### Changed

- Finisher motion was reworked to look like motion capture. Weight shifts onto the standing foot before a step, the body sinks into every landing, heads stay level and keep their eyes on the target, hands travel in arcs around the shoulder and arrive with some overshoot, feet shift during long holds, and bodies press against each other instead of passing through. Falling bodies bend at the waist, knees give first, and heads loll.
- The VEKTOR-9, PX-4 Hornet and SK-18 Wasp kick much harder, but only for the eye: the gun jerks straight back at your face with every round, the sight jumps closer and your aim stays where it is. The machine pistol kicks the most. Aiming down sights takes part of it out.
- Muzzle smoke is one thin wisp that curls up when you stop firing and is gone after a moment.

### Fixed

- After the first round of a session, weapons could refuse to fire for several minutes because the fire timer was still running on the previous round's clock.
- Barrel smoke from the last shots could stay frozen on screen while the weapon was hidden.

## [0.1.0] - 2026-10-30

The first release.

### Added

**Modes and bots**
- Team Deathmatch and Free for All with a score limit and a 10-minute time limit.
- 1 to 8 bots on four difficulty levels: Recruit, Regular, Veteran and Elite.

**Maps**
- Drydock: harbor at sunset.
- Citadel: Mediterranean old town at noon.
- Blacksite: research facility at dusk.

**Weapons**
- Nine weapons: AR-77 Valkyr, Vektor-9, HMG-90 Bulwark, MK-14 Warden, Longbow .338, Breacher-12, P-11 Sidearm, .44 Judge and SK-18 Wasp.
- Five optics: iron sights, reflex, holographic, 3x TAC-3 with a picture-in-picture lens, and an 8x sniper scope.
- Loadout menu with weapon stats and a 3D preview. The loadout can also be changed in the middle of a round.
- Recoil patterns, damage falloff, headshot and limb multipliers, and bullets that can go through thin cover.

**Movement**
- Sprint and tactical sprint, with the rifle held upright.
- Slide with a one-handed weapon pose, slide cancel, dive and wall jump.
- Vaulting, plus a two-handed pull-up for ledges above head height.
- Crouching in mid-air lays the body flat for a prone landing.
- Prone with 360° turning and a roll onto the back. `Shift` gets up straight into a sprint.
- Aiming down sights while crouching, sliding and crawling.

**Animations**
- Tactical rifle reload with two magazines and a tossed-away mag.
- Empty rifle reload with a flicked-out mag, a slap and a racked bolt.
- Separate reloads for belt-fed, bolt-action, shotgun, revolver and pistol weapons.
- Pumping-arms pistol run and weapon inspection.
- Procedural soldiers with run cycles, ragdoll physics and a third-person death camera.
- Visible first-person body.

**World and look**
- All models, textures, animations and sounds are generated in code.
- Late-'90s PC shooter look with low-resolution textures, soft filtering, warm light and soft shadows.
- Breakable glass.
- Graphics quality levels and dynamic resolution.

**Interface**
- Main menu, pause menu, settings and controls overview (in German).
- HUD with minimap, score bar, kill feed, ammo counter and hit markers.

[0.4.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.4.0
[0.3.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.3.0
[0.2.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.1.0
