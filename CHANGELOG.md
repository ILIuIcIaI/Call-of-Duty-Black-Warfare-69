# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69/releases/tag/v0.1.0
