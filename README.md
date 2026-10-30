# Call of Duty Black Warfare 69

> **Unofficial fan project.** Not affiliated with, endorsed by or connected to Activision or the Call of Duty franchise. No code, models, textures or sounds from any other game are used.

A fast military first-person shooter that runs in your browser. Pick a loadout, add up to 8 bots and play Team Deathmatch or Free for All on three maps.

The game has no model, texture or audio files: every soldier, weapon, wall, animation and gunshot is generated in code on top of [three.js](https://threejs.org/).

![Firefight on Drydock with the in-game HUD: a soldier goes down while the rifle fires](docs/screenshots/firefight-hud.jpg)

**Current version: [0.1.0](CHANGELOG.md).** Download it from the [releases page](https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases).

## Features

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

Nine weapons, each with its own stats and handling. You can change your loadout in the middle of a round: press `L`, and the new weapons are in your hands as soon as you resume.

| Weapon | Type | Fire mode | Rounds per minute | Magazine |
|---|---|---|---|---|
| AR-77 Valkyr | Assault rifle | Automatic | 760 | 30 |
| Vektor-9 | Submachine gun | Automatic | 920 | 32 |
| HMG-90 Bulwark | Light machine gun | Automatic | 680 | 75 |
| MK-14 Warden | Marksman rifle | Semi-automatic | 340 | 15 |
| Longbow .338 | Sniper rifle | Bolt action | 50 | 5 |
| Breacher-12 | Shotgun | Pump action | 75 | 7 |
| P-11 Sidearm | Pistol | Semi-automatic | 420 | 15 |
| .44 Judge | Revolver | Semi-automatic | 165 | 6 |
| SK-18 Wasp | Machine pistol | Automatic | 1050 | 22 |

Optics: iron sights, reflex sight, holographic sight, the 3x TAC-3 with a picture-in-picture lens, and an 8x sniper scope. Which ones are available depends on the weapon.

![Loadout menu with weapon stats and a 3D preview of the selected rifle](docs/screenshots/menu-loadout.jpg)

### Three maps

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

Then open <http://localhost:8069> and click into the game to capture the mouse. The server only accepts connections from your own computer. Set the `PORT` environment variable to use a different port.

Good to know:

- The in-game text is currently in German.
- Your settings stay in your browser's local storage. The only outside requests are for the two interface fonts (Teko and Rajdhani) from Google Fonts. Without internet access the game uses system fonts instead.
- Browsers don't let a page block `Ctrl+W`. If you crouch with `Ctrl` while walking forward, the browser may try to close the tab, so the game asks for confirmation first. `C` crouches too.
- Where a browser can't capture the mouse, the camera follows the cursor and keeps turning at the window edge.

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
| `I` | Inspect weapon |
| `Tab` | Scoreboard |
| `L` | Change loadout, also in the middle of a round |
| `Esc` | Pause |

## For developers

- `?dev=1&map=citadel&bots=5` skips the menu and starts a match straight away.
- `&autopilot=1` lets an AI control the player for a hands-free playtest.

## Credits and license

- Built with [three.js](https://threejs.org/) (MIT license).
- Fonts: [Teko](https://fonts.google.com/specimen/Teko) and [Rajdhani](https://fonts.google.com/specimen/Rajdhani) (SIL Open Font License), loaded from Google Fonts.

No open-source license has been chosen for this project's own code yet, so all rights are reserved for now. "Call of Duty" is a trademark of Activision Publishing, Inc. and is used here only to describe this fan project.
