# Call of Duty Black Warfare 69

> **Unofficial fan project.** Not affiliated with, endorsed by or connected to Activision or the Call of Duty franchise. One map, PoolDay, comes from a Counter-Strike 1.6 map file ([credits](#credits-and-license)). Apart from that, no code, models, textures or sounds from any other game are used.

A fast military first-person shooter for Windows and the browser. Jump out of a plane in Warzone, a battle royale for 20 players, fight 2 against 2 for two points in Wingman, or add up to 8 bots and play Team Deathmatch, Free for All or Gun Game on ten maps. All of it also works together with your friends over the local network, nothing needs to be installed, and it runs on very weak computers too.

Apart from that one map file, the game has no model, texture or audio files: every soldier, weapon, skin, wall, animation and gunshot is generated in code on top of [three.js](https://threejs.org/).

![Wingman on Sirocco: point A is being taken, its blue flag climbs the pole on the dome of the cistern, a teammate nearby](docs/screenshots/wingman-sirocco.jpg)

**Current version: [0.6.0](CHANGELOG.md).** Download it from the [releases page](https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases): a Windows program, or a browser version you open straight from the disk. See [Getting started](#getting-started).

## Features

### Wingman

The newest mode: 2 against 2, you and a bot against two bots, or players together over the local network. Two points stand on the map, **A** and **B**, each a circle with a flagpole in the middle.

- **Taking a point:** stand in its circle. Alone it takes 10 seconds, with your teammate about 7. With both teams in the circle nothing moves, and a half-taken point slowly falls back once everybody has left it.
- **Winning:** the team that holds both points at the same time wins at once. After 7 minutes, the team with more kills wins.
- **Respawns** never run out, and you always come back at your own base.
- **What you see:** the flag of whoever is taking a point climbs the pole, the owner's flag flies at the top, blue for your team and red for the others. Both points show under the score, as markers over the map and on the minimap, and the circle you stand in tells you how far the taking has come.
- **Bots** play for the points: they split up while both are open, take the last one together, and run back when the others start taking one of theirs.
- **Maps:** Millrace and Cornice, built for the mode, plus Sirocco, Atrium, Dynamo, Blacksite, Citadel, Backrooms and Drydock. Every point was placed so that both teams walk the same distance to it and no spawn can see it. On Blacksite point A is up on the guard tower and point B around the helicopter.
- **Multiplayer:** with bots it is 2 against 2, without bots only the players play, so two of you play 1 against 1.

### Runs on a toaster

The game now also runs on very weak computers, and on ones with no usable graphics chip at all.

- **Auto** picks the graphics level when the game starts, from the graphics chip: **Toaster** without a usable chip or on very old ones, **Niedrig** on most Intel HD and UHD chips and older AMD ones, **Mittel** on everything else. If the game still runs slowly with the smallest picture, it starts one level lower next time. **Hoch** is only ever your own choice.
- **Toaster** draws a smaller picture that dynamic resolution keeps between 35 and 75 percent, shows soldiers as simple bodies, and leaves out shadows, extra lights and clouds. It aims for a steady 30 to 45 frames per second.
- **Everywhere:** soldiers that are small on screen are drawn as a simple body with one draw call instead of about eleven, and much of the rest got leaner too. With the processor slowed to a quarter, Drydock now runs at 159 instead of 109 frames per second; drawn by the processor alone, at 52 instead of 7. Warzone loads in 9.7 instead of 15.1 seconds. The [changelog](CHANGELOG.md) has all of it.
- The Windows version starts even without a usable graphics chip: the processor draws the picture then, and Auto picks Toaster.

![The settings: graphics level Auto, which picked Toaster on a computer without a graphics chip](docs/screenshots/settings-graphics.jpg)

### Five new maps

**Sirocco**, a walled caravan town in the desert: a domed market hall with a door on every side, the well square with a tea house terrace, a caravanserai with a gallery on its arcade roofs, houses to run through and flat roofs with a bridge over the street. **Atrium**, an office building in the evening: two floors around a glass-roofed lobby, open-plan offices, a server room and a boardroom behind glass, a canteen and loading yards. **Dynamo**, a coal-fired power station at dusk: a turbine hall with catwalks and a bridge, a coal heap you can climb and a switchyard with its control house. Two more were built for Wingman: **Millrace**, a sawmill on a mill stream in the morning mist, point A in the saw hall over the water and point B on the timber landing by the jetty; and **Cornice**, a cable car station and a mountain hut in the snow at sunset, point A up on the gondola deck and point B in the hut by the tiled stove.

| Sirocco | Sirocco, the well square |
|---|---|
| ![Sirocco from above: the domed market hall, the well square, the caravanserai and the town wall](docs/screenshots/sirocco-town.jpg) | ![The domed market hall and the well house, seen from the tea house terrace](docs/screenshots/sirocco-well.jpg) |

| Atrium, the gallery | Atrium, the lobby |
|---|---|
| ![The gallery around the glass roof over the lobby, offices behind glass](docs/screenshots/atrium-gallery.jpg) | ![The reception desk in the lobby, the steel sculpture and the gallery behind it](docs/screenshots/atrium-lobby.jpg) |

| Dynamo, the switchyard | Dynamo, the turbine hall |
|---|---|
| ![The power station from above: the switchyard with transformers and the control house, cooling towers behind](docs/screenshots/dynamo-switchyard.jpg) | ![Between the turbine sets in the hall, catwalks and a crane above](docs/screenshots/dynamo-hall.jpg) |

| Millrace | Millrace, the saw hall |
|---|---|
| ![The sawmill from above: the red saw hall over the stream, the weir and the bridge, stacks of boards and the crane walkway, pine forest around](docs/screenshots/millrace-overview.jpg) | ![Inside the saw hall: the frame saw in the middle, the loft along the wall](docs/screenshots/millrace-sawhall.jpg) |

| Cornice | Cornice, the hut |
|---|---|
| ![The snowy saddle from above: the cable car station, the hut with its balcony, the summit cross and the garages, mountains behind](docs/screenshots/cornice-overview.jpg) | ![The parlour of the hut: benches and tables around the green tiled stove](docs/screenshots/cornice-hut.jpg) |

### Bodies that fight as they fall

A soldier hit for the last time doesn't topple over like a board any more. For a moment the body still fights: it staggers a step or two to keep its balance, a hand goes to the wound, the knees give, the arms reach for the ground it falls toward, and the chin tucks when it goes over backwards. Once it is down, a leg draws up one last time before it lies still. The hit decides how it goes: a head shot drops it where it stands, a shotgun up close throws it off its feet, a shot in the back pitches it forward, a runner stumbles on and catches itself on its hands, and a body shot in front of a wall slides down it.

![A soldier shot while running stumbles on, pitches forward and catches the fall with both hands](docs/screenshots/ragdoll-runner.jpg)

### Backrooms

A map for Team Deathmatch, Free for All, Gun Game and Wingman: the Backrooms, the internet legend of endless empty back rooms. Yellow wallpaper, damp carpet and a low suspended ceiling full of fluorescent panels that hum. The map is compact, 48 by 40 meters, and its parts are the oddities the legend tells of:

![The pillar hall: rows of wallpapered pillars under the panels of the suspended ceiling, a soldier between them](docs/screenshots/backrooms-pillars.jpg)

- **The pillar hall** in the middle, a pillar on every second corner, with long lanes and plenty to hide behind.
- **The arch rooms** in the north: pale rooms with arched doorways, and arched windows you can shoot and vault through.
- **The red room** between them: red walls, red carpet, and red light that spills out of its doors.
- **The office** in the south, with half-height partitions to crouch behind.
- **The holes:** a room with pits in the floor. The light doesn't reach the bottom, and whoever falls in doesn't come back. Bots keep clear of them.
- **The dark:** a part where the lights have gone out, apart from one that flickers.
- **Two spawn halls** and, between them and the pillar hall, a maze of partitions laid out so that no line of sight runs from one spawn to the other.

The hum of the tubes is loud under the lights, stutters when one flickers and falls silent in the dark. Like everything else it is made in code: the wallpaper, carpet and ceiling are painted textures, and the light is worked out once when the map loads. Both halves mirror each other, so both teams get the same ways.

| The red room | The arch rooms |
|---|---|
| ![Red walls, red carpet and red light under the panels, a soldier at the far end](docs/screenshots/backrooms-red.jpg) | ![The pale gallery with its arched windows, a soldier coming down it](docs/screenshots/backrooms-arches.jpg) |

| The holes | The office |
|---|---|
| ![A room with dark pits in the carpet, a missing ceiling tile and a soldier between the pits](docs/screenshots/backrooms-holes.jpg) | ![Half-height partitions with wooden caps, a soldier behind one of them](docs/screenshots/backrooms-office.jpg) |

![The dark: dim corridors between partitions, a dead panel in the ceiling, light from the next room](docs/screenshots/backrooms-dark.jpg)

### Warzone

A battle royale for you and 19 bots on Serena, an island with a town, a harbor, an airfield, a military base, villages and mountains. Jump when you like, steer your parachute and shoot your sidearm on the way down. Then find a weapon before someone finds you, because the safe zone keeps shrinking until only one is left.

| Over the island | Under the canopy |
|---|---|
| ![The transport plane over the island of Serena](docs/screenshots/warzone-plane.jpg) | ![Holding the parachute lines high above the town](docs/screenshots/warzone-parachute.jpg) |

- **Loot:** 170 chests and 280 items on the ground. Any weapon can come with any optic and any [skin](#weapon-skins), in five rarity levels from Common to Legendary. Higher rarities hit harder, hold more rounds, reload faster and kick less.
- **Armor:** carry up to 5 plates and wear up to 3. Each one takes 50 damage.
- **Vehicles:** hatchback, sedan, pickup, jeep and off-roader, with a first- and third-person camera.
- **Going down:** at zero health you crawl, bleed out and can revive yourself, a little slower each time.
- **Bots:** they loot, fight each other and come after you as the zone closes in.

| Compact item card | Armor plate |
|---|---|
| ![A card above a rifle on the ground with its name, rarity and picture, and a colored outline around the rifle](docs/screenshots/warzone-loot.jpg) | ![An armor plate held up in first person with the rifle moved aside](docs/screenshots/warzone-plate.jpg) |

| Map with the zone | Floor plans on the minimap |
|---|---|
| ![The full map with place names, the safe zone and the next zone](docs/screenshots/warzone-map.jpg) | ![The minimap showing the rooms of the upper floor while standing inside a building](docs/screenshots/warzone-floorplan.jpg) |

### Gun Game

Everyone for themselves, and every kill puts the next weapon in your hands. The ladder has 15 levels: 14 guns from the P-11 Sidearm up to the Titan .50, and then the knife. Whoever gets a kill with the knife wins the match.

- **Melee:** a knife kill doesn't move the killer up. It takes one level away from the victim instead, unless the killer is on the last level. Killing yourself costs a level too.
- **The knife:** two stabs on someone at full health, or one on a bot from behind. It's the only thing you hold on the last level, and the left mouse button stabs with it.
- **Skins:** every new weapon comes with a random skin, the standard look included.
- **No loadout:** the ladder decides what you carry. The HUD shows your level, the next weapon and who is ahead, and the scoreboard shows everyone's level and weapon.
- **Bots** climb the same ladder and come at you with the knife when they get there. It works on all ten maps, and with your friends over the network.

| Who is ahead, and with what | The last level |
|---|---|
| ![The Gun Game scoreboard with level, weapon, kills and deaths for every player](docs/screenshots/gungame-board.jpg) | ![The knife in the Flüssigchrom skin in mid-stab, level 15 of 15](docs/screenshots/gungame-knife.jpg) |

### Weapon skins

Six skins next to the standard look. They are painted in code and fitted to each weapon: the pattern runs over the body, while lenses, glass and reticles stay clear so you can still see through your sights.

![All six skins on six different weapons, side on, on a dark background](docs/screenshots/skins.jpg)

| Skin | Look |
|---|---|
| **Glutglas** | Red glass with glowing seams |
| **Riss** | White and cracked, with neon-green cracks that run on into the air |
| **Magenta** | Pink and purple shards |
| **Plasma** | Dark teal with bright clouds of turquoise that slowly drift |
| **Flüssigchrom** | Liquid silver in black and white stripes |
| **Neonader** | Black with pulsing turquoise veins |

Every weapon has its own skin in the loadout menu: a row of small buttons under the optics. In Warzone and Gun Game the skin is random. All seven looks are equally likely, and the item card tells you which one a weapon on the ground has.

| Flüssigchrom | Neonader | Plasma |
|---|---|---|
| ![MK-14 Warden in Flüssigchrom on Drydock at sunset](docs/screenshots/skin-chrom.jpg) | ![AR-77 Valkyr in Neonader on Blacksite at dusk](docs/screenshots/skin-neonader.jpg) | ![Vektor-9 in Plasma on the Citadel piazza](docs/screenshots/skin-plasma.jpg) |

| Magenta | Riss | Glutglas |
|---|---|---|
| ![PX-4 Hornet in Magenta on PoolDay](docs/screenshots/skin-magenta.jpg) | ![KR-3 Triad in Riss on Drydock](docs/screenshots/skin-riss.jpg) | ![HMG-90 Bulwark in Glutglas on the Citadel piazza](docs/screenshots/skin-glutglas.jpg) |

| On the ground in Warzone |
|---|
| ![A KR-3 Triad in Neonader on the ground, with its card naming the optic and the skin](docs/screenshots/warzone-skin.jpg) |

### Finishers

Press `V` next to a hurt enemy for one of 26 staged kills: 14 on enemies who are standing and 12 on enemies who are down. Each one is a short scene with its own camera, and it comes back to first person at the end. It works both ways: a bot that gets behind you when you are down or low on health finishes you with the same scenes, and you watch it happen.

- **Bots** can be finished from any side once they are hurt enough, and from any side when they are lying on the ground.
- **Players** can only be finished from behind, by bots and by other players alike: on their feet when their health is low enough, on the ground as well. A bot walks around someone lying there to get to their back.

There are no motion files behind them. Every scene is written as keys and baked once when the match starts. That step works out what a body would really do: the weight goes onto the standing foot before a step, heads stay level and keep their eyes on the target, hands travel in arcs around the shoulder, and when the muscles let go, physics takes over.

| The suplex | The axe |
|---|---|
| ![One soldier lifting another over backward](docs/screenshots/finisher-suplex.jpg) | ![A soldier raising an axe over an enemy on their knees](docs/screenshots/finisher-axe.jpg) |

When a bot gets you, you see it from the scene's camera:

![A bot standing over you as you lie on the ground, with black bars and the name of the scene](docs/screenshots/finisher-bot.jpg)

### Fast movement

Sprint, press Shift again for a tactical sprint, and drop straight into a slide. Jump out of the slide to cancel it and keep your speed. You can also dive, wall-jump up to three times, or hit crouch in mid-air to lay flat and land prone.

Prone is a real stance too. You can turn a full 360°, and looking behind you rolls the character onto their back with the legs in view. Shift gets you up and running immediately.

| Tactical sprint | Slide | On your back |
|---|---|---|
| ![Tactical sprint with the rifle held upright](docs/screenshots/tac-sprint.jpg) | ![Slide with the rifle held one-handed and tipped toward the ground](docs/screenshots/slide.jpg) | ![Lying on the back with the legs in view](docs/screenshots/prone-back.jpg) |

### Climbing

Jump at almost any edge. Low cover is vaulted in one motion. For ledges above head height the weapon drops out of view and both hands reach up and pull you over, with no teleporting.

| Grab the ledge | Pull yourself up |
|---|---|
| ![Both hands reaching for a high ledge](docs/screenshots/climb-reach.jpg) | ![Pulling up over the ledge](docs/screenshots/climb-pull.jpg) |

### Gunplay and reloads

![Firefight on Drydock with the in-game HUD: a soldier goes down while the rifle fires](docs/screenshots/firefight-hud.jpg)

- Automatic weapons kill in about 250 to 350 milliseconds at close range, and their recoil follows patterns you can learn.
- Damage falloff, headshot and limb multipliers, and bullets that can go through thin cover.
- Quick aiming that works while crouching, sliding and crawling.
- Reloads with more going on than "mag out, mag in". The rifle's tactical reload brings in the fresh magazine next to the old one and tosses the old one away. An empty reload flicks the magazine out, slaps it home and racks the bolt.
- Every reload style is animated separately: magazine, belt-fed box, bolt action, shotgun shells, revolver and pistol.
- Inspect your weapon with `I`.

| Two magazines in hand | Old magazine tossed away |
|---|---|
| ![Tactical reload with both magazines in the left hand](docs/screenshots/reload-two-mags.jpg) | ![The used magazine flying away during a tactical reload](docs/screenshots/reload-toss.jpg) |

| Empty magazine flicked out | Fresh magazine, then the bolt |
|---|---|
| ![The empty magazine flying out of the rifle](docs/screenshots/reload-empty-flick.jpg) | ![The left hand slapping the rifle during an empty reload](docs/screenshots/reload-bolt-slap.jpg) |

### Weapons and optics

Fourteen weapons, each with its own stats and handling, plus the knife at the end of Gun Game. You can change your loadout in the middle of a round: press `L`, and the new weapons are in your hands as soon as you resume.

| Weapon | Type | Fire mode | Rounds per minute | Magazine |
|---|---|---|---|---|
| AR-77 Valkyr | Assault rifle | Automatic | 760 | 30 |
| KR-3 Triad | Burst rifle | 3-round burst | 900 | 30 |
| Vektor-9 | Submachine gun | Automatic | 920 | 32 |
| PX-4 Hornet | Submachine gun | Automatic | 1080 | 40 |
| HMG-90 Bulwark | Light machine gun | Automatic | 680 | 75 |
| MK-14 Warden | Marksman rifle | Semi-automatic | 340 | 15 |
| Longbow .338 | Sniper rifle | Bolt action | 50 | 5 |
| Titan .50 | Anti-materiel rifle | Semi-automatic | 95 | 7 |
| Breacher-12 | Shotgun | Pump action | 75 | 7 |
| Siege-8 | Automatic shotgun | Semi-automatic | 210 | 8 |
| P-11 Sidearm | Pistol | Semi-automatic | 420 | 15 |
| .44 Judge | Revolver | Semi-automatic | 165 | 6 |
| M-50 Bastion | Heavy pistol | Semi-automatic | 125 | 7 |
| SK-18 Wasp | Machine pistol | Automatic | 1050 | 22 |

Fourteen optics, from iron sights and red dots through 2x to 12x scopes to thermal sights. Scopes use a picture-in-picture lens. Which ones are available in the loadout menu depends on the weapon.

Aiming against an edge rests the weapon on it for less recoil, and at corners you lean out.

![Loadout menu with weapon stats, the skin buttons and a 3D preview of the selected rifle in the Plasma skin](docs/screenshots/menu-loadout.jpg)

### Maps

Besides the island of Serena, ten maps for Team Deathmatch, Free for All and Gun Game, nine of them for [Wingman](#wingman) as well:

| Map | Size | Setting |
|---|---|---|
| **Drydock** | Medium | Harbor at sunset with a long quay, a warehouse with catwalks and a container yard |
| **Citadel** | Small to medium | Mediterranean old town at noon with a piazza and fountain, a market alley and a roof terrace; lots of height and flanking routes |
| **Blacksite** | Small | Research facility at dusk with a lab and glass server room, a helipad, a watchtower and trenches as flanking routes |
| **PoolDay** | Very small | The Counter-Strike 1.6 classic by Squall: an open swimming hall with an empty pool, locker rooms, showers and toilets |
| **[Backrooms](#backrooms)** | Small | Endless yellow back rooms: a pillar hall, arch rooms, the red room, an office, holes in the floor and a part where the lights are out |
| **[Sirocco](#five-new-maps)** | Small to medium | A walled caravan town in the desert: a domed market, the well square, a caravanserai, roofs and bridges |
| **[Atrium](#five-new-maps)** | Small to medium | An office building in the evening: two floors around a glass-roofed lobby, offices, a server room, a canteen |
| **[Dynamo](#five-new-maps)** | Small to medium | A coal-fired power station at dusk: a turbine hall with catwalks, a coal heap, a switchyard |
| **[Millrace](#five-new-maps)** | Small | A sawmill on a mill stream, built for Wingman: a saw hall over the water, a timber landing by the jetty, a weir |
| **[Cornice](#five-new-maps)** | Small | A cable car station and a mountain hut in the snow, built for Wingman: the gondola deck, the hut's parlour, the summit rock |

**PoolDay** isn't rebuilt. The game reads the original map file when it starts: every wall, the original textures and the baked light, the solid parts, the spawn points and the stall doors. The pool in the middle is dry, so you jump in and climb back out. The whirlpool still has its water, the stall doors open as you walk up to them, and `F` at a urinal does what it always did.

![The hall on PoolDay from the diving board: the rules on the wall, soldiers around and inside the empty pool](docs/screenshots/poolday-hall.jpg)

| The other way round | Down in the pool |
|---|---|
| ![The hall seen from the far end, with the blue and red showers behind the pool](docs/screenshots/poolday-showers.jpg) | ![Looking up from the bottom of the pool at two soldiers on its edge](docs/screenshots/poolday-pool.jpg) |

| Lockers and stalls on the red side | Lockers and urinals on the blue side |
|---|---|
| ![The red wing with a row of lockers and the stall doors at its end](docs/screenshots/poolday-lockers.jpg) | ![The blue wing with lockers on the left and urinals on the right](docs/screenshots/poolday-toilets.jpg) |

![The whirlpool with its water, under the window band](docs/screenshots/poolday-whirlpool.jpg)

![The container yard on Drydock with two soldiers](docs/screenshots/drydock-yard.jpg)

| Drydock warehouse | Citadel piazza |
|---|---|
| ![Inside the Drydock warehouse](docs/screenshots/drydock-warehouse.jpg) | ![Two soldiers on the Citadel piazza](docs/screenshots/citadel-square.jpg) |

| Citadel roof terrace | Blacksite at dusk |
|---|---|
| ![View from the roof terrace on Citadel](docs/screenshots/citadel-terrace.jpg) | ![Two soldiers among containers on Blacksite](docs/screenshots/blacksite-dusk.jpg) |

### Modes and bots

- **Team Deathmatch** and **Free for All**, with a score limit and a 10-minute time limit, **[Gun Game](#gun-game)**, where the knife decides it, and **[Wingman](#wingman)**, 2 against 2 for two points.
- 1 to 8 bots on four difficulty levels: Recruit, Regular, Veteran and Elite.
- [Bodies that fight as they fall](#bodies-that-fight-as-they-fall), a third-person death camera, a visible first-person body, a minimap, a kill feed and glass that breaks.

| Match setup | Death camera |
|---|---|
| ![Main menu with the ten maps](docs/screenshots/menu-play.jpg) | ![Third-person death camera looking down at the fallen player](docs/screenshots/death-cam.jpg) |

### The look

Low-resolution textures painted in code, in the spirit of late-'90s PC shooters, with soft filtering, flat warm light and soft shadows. The settings have four graphics levels, Toaster, Niedrig, Mittel and Hoch, plus Auto, which picks one for your computer (see [Runs on a toaster](#runs-on-a-toaster)), and dynamic resolution.

## Getting started

There are two downloads on the [releases page](https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases). Neither needs anything installed, Node.js included.

**Windows version** (`Black-Warfare-69-0.6.0-Windows.zip`): extract it and double-click `Black Warfare 69.exe`. The game is a program of its own, with its own window, `F11` for full screen, **BEENDEN** in the menu to quit, and the multiplayer server built in. On laptops with two graphics chips it uses the stronger one. The download is about 140 MB because it brings its own browser engine and Node.js along ([Electron](https://www.electronjs.org/)). Windows may warn the first time about an app from an unknown publisher: click "More info", then "Run anyway".

**Browser version** (`Black-Warfare-69-0.6.0-Browser.zip`, about 1 MB): extract it and double-click `index.html`. The game runs straight from the disk in Chrome, Edge or Firefox, alone against bots, with no server and no internet connection. For multiplayer the browser needs the game's server: open the address that the lobby of a computer running the Windows version shows, or run `start.bat` in the folder (that one needs [Node.js](https://nodejs.org/)).

Any browser needs WebGL 2. Chrome or Edge is recommended. On a very weak computer the game picks the Toaster level by itself; in a browser, hardware acceleration has to be on.

**From the source** (needs Node.js):

```bash
git clone https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69.git
cd Call-of-Duty-Black-Warfare-69
npm install
npm start
```

Then open <http://localhost:8069> and click into the game to capture the mouse. Until you open Multiplayer, the server only accepts connections from your own computer. Set the `PORT` environment variable to use a different port. To build both downloads yourself: `cd desktop`, `npm install`, `npm run build`. They end up in `dist/`.

Good to know:

- The in-game text is currently in German.
- Your settings stay on your computer: in the browser's local storage, or in `%APPDATA%\black-warfare-69` for the Windows version. The game makes no requests to any other server; its two fonts come with it.
- Browsers don't let a page block `Ctrl+W`. If you crouch with `Ctrl` while walking forward, the browser may try to close the tab, so the game asks for confirmation first. `C` crouches too. The Windows version doesn't have that problem.
- Where a browser can't capture the mouse, the camera follows the cursor and keeps turning at the window edge.

## Multiplayer

Play over your local network, with no account and no internet connection.

| The lobby: everybody votes, and there is a chat | Friends with their names above their heads |
|---|---|
| ![The multiplayer lobby with two players, the vote on the map for Gun Game and the chat](docs/screenshots/multiplayer-lobby.jpg) | ![A teammate with a name tag in a Team Deathmatch](docs/screenshots/multiplayer-match.jpg) |

1. Everybody starts the game, the Windows version or in a browser, and clicks **MULTIPLAYER**, then picks a name.
2. The first player finds no room and opens one. Everybody after that lands in it automatically.
3. Nobody runs the room. Everybody votes: the mode (Team Deathmatch, Free for All, Gun Game, Wingman or Warzone), the map, and whether bots fill the free slots. In Wingman bots fill up to 2 against 2, and without them two of you play 1 against 1. The lobby has a chat.

If you die in Warzone you can watch the others or go back to the lobby. In Team Deathmatch, Free for All, Gun Game and Wingman you can join a running match at any time.

Good to know:

- The first time, Windows asks whether Black Warfare 69 (or Node.js, with `start.bat`) may use the network. Allow it, also for public networks if the dialog offers that. If the firewall still keeps others out, the lobby tells you and offers a **FREIGEBEN** button: one click, Windows asks once, and the rule only covers devices in your own network.
- As long as one computer lets others in, you end up together: a room nobody can get into gives way to one that works. The computers keep looking for each other while you wait, even if your router drops the usual network announcements between devices.
- If a computer doesn't find the room, open the address shown in the lobby in its browser. That computer doesn't need to install anything.
- The room lives on the computer that opened it. If that one goes away, everybody else looks for a new room.
- Bots run in one player's game: the first computer that runs it smoothly. A slow computer is spared that, and if it takes too long to load a match it simply comes in later.
- The computers have to be able to reach each other. Guest networks and some public networks keep their devices apart on purpose, and no game can get past that. A different network, a phone's hotspot or a cable between the computers will do.
- Everybody needs the same version of the game. The lobby says so if another version is on the network.
- Movement stays smooth on a shaky Wi-Fi too: every position goes out 20 times a second with the time it was true, and the others play it back a fraction of a second behind, at the pace it really happened. If a message is late, the body keeps moving for a moment instead of freezing. The scoreboard shows everyone's ping.

| When your own firewall keeps others out | When another computer lets nobody in |
|---|---|
| ![The lobby with a warning about the Windows firewall and a button to allow the game through](docs/screenshots/multiplayer-firewall.jpg) | ![The lobby with a note that a room on another computer can't be reached](docs/screenshots/multiplayer-blocked.jpg) |

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse / left button / right button | Look / fire / aim down sights |
| `Shift` | Sprint; press again for a tactical sprint |
| `Space` | Jump; climb; wall-jump (in the air next to a wall, up to 3 times) |
| `C` / `Ctrl` | Crouch; hold to go prone. While sprinting: tap to slide, hold to slide and dive. In the air: lay flat and land prone |
| `Z` / `X` | Go prone. While sprinting: dive (backwards: land on your back) |
| `Shift` (while prone) | Get up and sprint immediately |
| Look around (while prone) | Turn 360°; looking behind you rolls you onto your back |
| `Space` (while sliding) | Slide cancel: keeps your speed and refills the tactical sprint |
| `R` | Reload |
| `1` / `2` / `Q` / mouse wheel | Switch weapon |
| `V` / `E` | Melee; finisher next to a hurt enemy |
| Aim + `W` against an edge | Rest the weapon on it; lean out at corners |
| `T` | Rest the weapon by hand, on or off |
| `F` | Warzone: pick up, open a chest, get in and out of a vehicle. PoolDay: at a urinal, flush |
| `G` | Warzone: put on an armor plate |
| `M` | Warzone: full map |
| `V` (in a vehicle) | Warzone: change the camera |
| `I` | Inspect weapon |
| `Tab` | Scoreboard |
| `L` | Change loadout, also in the middle of a round (not in Gun Game) |
| `Esc` | Pause |
| `F11` | Windows version: full screen |

## For developers

- `?dev=1&map=citadel&bots=5` skips the menu and starts a match straight away.
- `?dev=1&map=poolday&bots=5&mode=gun` picks the mode as well; `map=backrooms` is the newest map.
- `?dev=1&br=1&bots=19` does the same for Warzone.
- `&autopilot=1` lets an AI control the player for a hands-free playtest.

## Credits and license

- Built with [three.js](https://threejs.org/) (MIT license).
- Fonts: [Teko](https://fonts.google.com/specimen/Teko) and [Rajdhani](https://fonts.google.com/specimen/Rajdhani) (SIL Open Font License), included in `src/ui/fonts` with their licenses.
- The Windows version runs on [Electron](https://www.electronjs.org/) (MIT license), which brings Chromium and Node.js along; their licenses come with it.
- Backrooms: the map is this game's own design, after the internet legend that began on 4chan in 2019 and the variations of its "Level 0" that fans have described since. Nothing from any Backrooms game, video or picture is used.
- PoolDay: the map is by Squall, made for Counter-Strike 1.6. Its file (`src/world/maps/poolday.bsp`) is included with its original textures and baked light, with one change: a crate texture was replaced by plain planks. All rights to the map stay with its author. The sky, the rocks on the horizon and the sound of the urinals are made in this game's code, because the map file doesn't contain them.

No open-source license has been chosen for this project's own code yet, so all rights are reserved for now. "Call of Duty" is a trademark of Activision Publishing, Inc. and "Counter-Strike" of Valve Corporation; both are used here only to describe this fan project.
