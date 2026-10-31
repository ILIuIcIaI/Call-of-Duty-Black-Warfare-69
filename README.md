# Call of Duty Black Warfare 69

> **Unofficial fan project.** Not affiliated with, endorsed by or connected to Activision or the Call of Duty franchise. No code, models, textures or sounds from any other game are used.

A fast military first-person shooter that runs in your browser. Jump out of a plane in Warzone, a battle royale for 20 players, or pick a loadout, add up to 8 bots and play Team Deathmatch or Free for All on three maps. All of it also works together with your friends over the local network.

The game has no model, texture or audio files: every soldier, weapon, wall, animation and gunshot is generated in code on top of [three.js](https://threejs.org/).

![Firefight on Drydock with the in-game HUD: a soldier goes down while the rifle fires](docs/screenshots/firefight-hud.jpg)

**Current version: [0.3.0](CHANGELOG.md).** Download it from the [releases page](https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases).

## Features

### Warzone

A battle royale for you and 19 bots on Serena, an island with a town, a harbor, an airfield, a military base, villages and mountains. Jump when you like, steer your parachute and shoot your sidearm on the way down. Then find a weapon before someone finds you, because the safe zone keeps shrinking until only one is left.

| Over the island | Under the canopy |
|---|---|
| ![The transport plane over the island of Serena](docs/screenshots/warzone-plane.jpg) | ![Holding the parachute lines high above the town](docs/screenshots/warzone-parachute.jpg) |

- **Loot:** 170 chests and 280 items on the ground. Any weapon can come with any optic, in five rarity levels from Common to Legendary. Higher rarities hit harder, hold more rounds, reload faster and kick less.
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

### Finishers

Press `V` next to a hurt enemy for one of 26 staged kills: 14 on enemies who are standing and 12 on enemies who are down. Each one is a short scene with its own camera, and it comes back to first person at the end. It works both ways: a bot that catches you down, or nearly dead right next to it, finishes you with the same scenes, and you watch it happen.

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

Fourteen weapons, each with its own stats and handling. You can change your loadout in the middle of a round: press `L`, and the new weapons are in your hands as soon as you resume.

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

![Loadout menu with weapon stats and a 3D preview of the selected rifle](docs/screenshots/menu-loadout.jpg)

### Maps

Besides the island of Serena, three maps for Team Deathmatch and Free for All:

| Map | Size | Setting |
|---|---|---|
| **Drydock** | Medium | Harbor at sunset with a long quay, a warehouse with catwalks and a container yard |
| **Citadel** | Small to medium | Mediterranean old town at noon with a piazza and fountain, a market alley and a roof terrace; lots of height and flanking routes |
| **Blacksite** | Small | Research facility at dusk with a lab and glass server room, a helipad, a watchtower and trenches as flanking routes |

![The container yard on Drydock with two soldiers](docs/screenshots/drydock-yard.jpg)

| Drydock warehouse | Citadel piazza |
|---|---|
| ![Inside the Drydock warehouse](docs/screenshots/drydock-warehouse.jpg) | ![Two soldiers on the Citadel piazza](docs/screenshots/citadel-square.jpg) |

| Citadel roof terrace | Blacksite at dusk |
|---|---|
| ![View from the roof terrace on Citadel](docs/screenshots/citadel-terrace.jpg) | ![Two soldiers among containers on Blacksite](docs/screenshots/blacksite-dusk.jpg) |

### Modes and bots

- **Team Deathmatch** and **Free for All**, with a score limit and a 10-minute time limit.
- 1 to 8 bots on four difficulty levels: Recruit, Regular, Veteran and Elite.
- Ragdoll physics, a third-person death camera, a visible first-person body, a minimap, a kill feed and glass that breaks.

| Match setup | Death camera |
|---|---|
| ![Main menu with map, mode and bot settings](docs/screenshots/menu-play.jpg) | ![Third-person death camera looking down at the fallen player](docs/screenshots/death-cam.jpg) |

### The look

Low-resolution textures painted in code, in the spirit of late-'90s PC shooters, with soft filtering, flat warm light and soft shadows. Graphics quality and dynamic resolution can be changed in the settings.

## Getting started

You need [Node.js](https://nodejs.org/) and a browser with WebGL 2. Chrome or Edge is recommended; other browsers are untested.

**From the release (nothing to install besides Node.js):**

1. Download the zip from the [releases page](https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases) and extract it.
2. On Windows, double-click `start.bat`. Anywhere else, run `node server.js` in the folder and open <http://localhost:8069>.

**From the source:**

```bash
git clone https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69.git
cd Call-of-Duty-Black-Warfare-69
npm install
npm start
```

Then open <http://localhost:8069> and click into the game to capture the mouse. Until you open Multiplayer, the server only accepts connections from your own computer. Set the `PORT` environment variable to use a different port.

Good to know:

- The in-game text is currently in German.
- Your settings stay in your browser's local storage. The only outside requests are for the two interface fonts (Teko and Rajdhani) from Google Fonts. Without internet access the game uses system fonts instead.
- Browsers don't let a page block `Ctrl+W`. If you crouch with `Ctrl` while walking forward, the browser may try to close the tab, so the game asks for confirmation first. `C` crouches too.
- Where a browser can't capture the mouse, the camera follows the cursor and keeps turning at the window edge.

## Multiplayer

Play over your local network, with no account and no internet connection.

| The lobby: everybody votes, and there is a chat | Friends with their names above their heads |
|---|---|
| ![The multiplayer lobby with three players, the vote on the game mode and the chat](docs/screenshots/multiplayer-lobby.jpg) | ![A teammate with a name tag in a Team Deathmatch](docs/screenshots/multiplayer-match.jpg) |

1. Everybody starts the game and clicks **MULTIPLAYER**, then picks a name.
2. The first player finds no room and opens one. Everybody after that lands in it automatically.
3. Nobody runs the room. Everybody votes: the mode (Team Deathmatch, Free for All or Warzone), the map, and whether bots fill the free slots. The lobby has a chat.

If you die in Warzone you can watch the others or go back to the lobby. In Team Deathmatch and Free for All you can join a running match at any time.

Good to know:

- The first time, Windows asks whether Node.js may use the network. Allow it, or nobody will find the room.
- If a computer doesn't find the room, open the address shown in the lobby in its browser. That computer doesn't need Node.js at all.
- The room lives on the computer that opened it. If that one goes away, everybody else looks for a new room.

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
| `F` | Warzone: pick up, open a chest, get in and out of a vehicle |
| `G` | Warzone: put on an armor plate |
| `M` | Warzone: full map |
| `V` (in a vehicle) | Warzone: change the camera |
| `I` | Inspect weapon |
| `Tab` | Scoreboard |
| `L` | Change loadout, also in the middle of a round |
| `Esc` | Pause |

## For developers

- `?dev=1&map=citadel&bots=5` skips the menu and starts a match straight away.
- `?dev=1&br=1&bots=19` does the same for Warzone.
- `&autopilot=1` lets an AI control the player for a hands-free playtest.

## Credits and license

- Built with [three.js](https://threejs.org/) (MIT license).
- Fonts: [Teko](https://fonts.google.com/specimen/Teko) and [Rajdhani](https://fonts.google.com/specimen/Rajdhani) (SIL Open Font License), loaded from Google Fonts.

No open-source license has been chosen for this project's own code yet, so all rights are reserved for now. "Call of Duty" is a trademark of Activision Publishing, Inc. and is used here only to describe this fan project.
