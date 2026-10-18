# 100 Floors

Two classic Chinese flash games in one, starring Teddy and Tommy, built with Claude Code from plain JavaScript and Three.js:

- **⬇ DOWN, 下一百层**: the screen keeps scrolling up. Run along the platforms and drop off their edges to go deeper, without touching the spiky ceiling and without falling off the bottom.
- **⬆ UP, 上一百层**: Icy Tower and Doodle Jump style. The kid bounces off every platform; steer to land on the next one up, and get there before the rising bottom of the screen catches you.

It's a side view in 3D. The kids are the shared kit's blocky characters, every texture is painted on a canvas, and every sound is synthesised. There are no image, model or audio files.

The name lives in one place, [js/title.js](js/title.js), so it's easy to rename. "100 Floors" is a working title.

## Play

- **Double-click `index.html`.** It works offline, because Three.js and the kit are copied into `kit/`. Without internet the title font falls back to Arial Black.
- **Send one file:** `dist/hundred-floors.html` is the whole game in one page (about 790 KB). AirDrop or email it, then open it in a browser.
- Rebuild that file after any edit: `python3 kit/tools/bundle.py . --name hundred-floors`
- Bests are saved per browser, and separately for each way of opening the game, so `index.html` and the dist page each keep their own.

| Keys | Touch / mouse | |
|---|---|---|
| ← → or A D | hold the left or right half of the screen | move |
| Space, ↑ or W | ⤒ JUMP button (UP mode, touch screens) | big jump: hold it as you land to bounce much higher (UP) |
| | 📱 TILT on the title screen | steer by tilting the phone or iPad; then a tap anywhere is a big jump in UP |
| T | the big button with his face (bottom right), or his dashed card on the title | call your buddy, any time and as often as you like |
| ↓ / ↑ then Enter or Space | tap ⬇ DOWN or ⬆ UP | pick a mode and go (title screen) |
| ← → | tap a card | pick your kid (title screen) |
| E | 🐣 button | easy mode on or off (title screen) |
| P or Esc | ❚❚ button | pause |
| M | 🔊 button | sound on or off |

## How it plays

**Pick your kid** on the title screen: TEDDY and TOMMY first (modelled on their photos, from the kit roster), then ZOOM, LUNA, BOLT the robot, BRUNO the bear and the ZOMBIE. Behind the menu the kid plays the chosen mode on autopilot. Tap ⬇ DOWN or ⬆ UP to play, then 3, 2, 1, GO!

**DOWN (下一百层).** The shaft is 10 m wide, with one or two platforms on every floor, and the view sinks steadily so the platforms rise toward the ceiling.

- **Move** left and right; walk off an edge to drop to the next platform.
- **Hazards:** touching the spiky ceiling costs a heart and pushes you down through your platform. Falling off the bottom costs a heart, then you pop back onto a safe platform.
- **The view eases in** over the first few seconds, sinks at 1.6 m/s to start and speeds up gently with every floor, up to 2.8 m/s by floor 120. If you stand low on the screen it catches up a little, so running ahead isn't punished.

**UP (上一百层).** The kid bounces automatically off every platform he lands on, and platforms let you jump up through them from below.

- **Bounces:** running fast bounces a bit higher, and holding jump (Space, ↑, W or ⤒) as you land gives a BIG jump with a flip.
- **The camera** follows you up. After 4 s the bottom of the screen starts rising slowly (0.5 m/s, up to 1.6 m/s by floor 100). Falling below it costs a heart, then you pop back onto a platform.
- **Combos:** a jump that lands 2 or more floors higher is a multi-floor jump ("2 FLOORS!"). Do another within 3 s and it's a combo ("COMBO ×2!"), with a timer bar under the floor counter. When the combo ends, every floor in it becomes a ⭐ combo star.

**Platforms** (both modes):

| Platform | Looks like | DOWN | UP |
|---|---|---|---|
| normal | wooden plank / snowy sky-stone | stand on it | bounce |
| springy | red-and-white trampoline on springs | BOING!: bounces you up | super bounce |
| conveyor ⬅ ➡ | dark belt with moving yellow arrows | carries you along (you can walk against it) | kicks you sideways as you bounce |
| crumbling | a big cookie | shakes, then crumbles under you after half a second | crumbles after one bounce |
| spiky | purple plank with silver spikes | costs a heart when you land on it | costs a heart (you still bounce) |

- **Pickups:** treats (🍪 🍓 🍩 🧁 🍭 🍬) float over platforms; each one counts. A ❤️ comes about every 12 floors and gives a heart back (up to 5).
- **Hearts:** 3 to start (5 in easy mode). After a bump you blink and nothing can hurt you for a moment.
- **Floors and milestones:** the big counter shows your deepest (or highest) floor. Signs on the wall count every 5 floors (B5, B10… going down, 5F, 10F… going up), and every 25th floor is a wide golden ledge with a big sign.
- **Celebrations at 25, 50, 75 and 100** (and every 25 after): the game pauses, the camera zooms in, confetti flies and "★ 25 FLOORS! ★" pops up while your kid does their signature move.
  - **TEDDY** does a Mike Tyson-style boxing combo (jab, straight, 💥 on every punch) at 25 and 75, and his basketball jump shot at 50: a hoop pops up beside him and the 🏀 swishes through it. At 100 he does both.
  - **TOMMY** does his Y pose with peace fingers (比耶) and happy hops, with ✌️ and ⭐ floating up.
  - Everyone else waves.
  - At 100: "100 FLOORS! YOU DID IT, TEDDY! 🎉". The game keeps going after that for a new best.
- **Game over** when the hearts run out: your floor, treats, combo stars and best. A new best gets "YAY!", confetti and the signature moves.
- **Bests** are kept per mode and per kid (and separately for easy mode). Each kid's card on the title shows their ⬇ and ⬆ bests.
- **Easy mode (🐣)** has 5 hearts, wider platforms, a slower view (DOWN 1.2 → 2.0 m/s; UP 0.35 → 1.0 m/s), fewer spikes that start later, and more extra platforms. It's on by default for Tommy and remembered per kid.

The scenery changes as you go. Going DOWN, the cave turns from sandy soil to orange clay (fossils, a little 🦕), then purple crystals (💎 🔮), blue, and teal glowing mushrooms, with 👑 treasure past 100. Going UP, the sky goes from blue past the clouds, through a pink sunset with balloons and planes, into night with stars, a 🌙, 🪐 and a 🛸.

## Your buddy (companion mode)

Your buddy is the other brother: **Tommy** comes for everyone, and **Teddy** comes when Tommy plays (`Kit.roster.buddyFor`). Tap the big button with his face (bottom right), press **T**, or tap his dashed **BUDDY · TAP ME!** card on the title screen. A visit lasts about 10 s:

- **He floats in** from the top of the screen, tied to a balloon in his name-tag colour (blue for Teddy, orange for Tommy), with a name tag on top. He keeps beside you, toward the middle of the shaft.
- **He says hi** with his signature move: Tommy's Y pose, or Teddy's boxing combo.
- **He hands you a treat:** 🍦 💧 🧃 🍪 🍉 or 🍌 arcs from his hand into yours with a toast like "🍦 ICE CREAM FROM TOMMY!", and your kid holds it for a while.
- **He says bye** (Teddy shoots a 🏀 through a pop-up hoop; Tommy does his Y again), waves and floats away up.
- **He has your back:** while he's here (the first 9.6 s, while the bar with his face under your hearts runs down and his button glows), nothing costs a heart.
  - Land on spikes and the spikes go blunt: "SAFE!" and "TOMMY SAVED YOU!" (or "TEDDY SAVED YOU!").
  - Bump the ceiling and you're pushed down without losing a heart.
  - Fall off the bottom and he swoops down and carries you back up to a safe platform, holding your hands.
- **Tap again** while he's here and, once he's handed over his treat, he says hi again and brings another one. Tapping while he's floating off brings him straight back. There's no cooldown.

## Fairness check (headless)

Every platform comes from one generator, and the generator checks itself as it goes. It tries simple inputs with the real physics (walk this way, steer that way, switch at some moment) and only keeps a row when every platform still has a way on that isn't spiky. If 14 random tries fail it lays a wide ledge instead. From the game folder:

```bash
node tools/check.js
```

It runs the same `js/sim.js` the game uses:

1. **Fairness:** 30 courses × 300 floors per mode, normal and easy. DOWN: from every platform, a non-spiky platform within 2 rows below. UP: from every platform, bouncing off either end or the middle, standing still or running full speed either way, a non-spiky platform above within reach of a plain bounce.
2. **Proof it can fail:** the same check on an unchecked generator must flag platforms.
3. **Soak:** whole games under the real rules (the moving view, the ceiling, the bottom, spikes), played by the autopilot, and by nobody steering, which must lose hearts.

Last run: 0 platforms without a way on, out of 10,589 (DOWN), 11,508 (DOWN easy), 12,492 (UP) and 12,426 (UP easy), with 2 wide-ledge fallbacks in total. The unchecked generators were flagged on 16 of 1,065 (DOWN) and 30 of 1,240 (UP) platforms. The autopilot reached floor 150 in all 32 games with no game over; it lost 3 hearts in total, 2 to the ceiling deep in DOWN and 1 fall in UP. With nobody steering, every game ended in a game over. It takes about 6 s.

The same check runs in the browser console: `floors.check({ mode: 'up', seeds: 5, floors: 200 })`, `floors.soak({ mode: 'down', runs: 3 })`, and `{ broken: true }` for the unchecked generator.

## Testing hooks

`window.floors` drives the game from the console. The Browser pane throttles animation while it's hidden, so time can be stepped by hand:

```js
floors.keepAwake(); floors.hold()  // don't pause when hidden; stop the live clock (only step() moves time)
floors.calm()                      // turn CSS animations off (a hidden pane freezes them half-way)
floors.start('down', 'teddy')      // or 'up', and any kid
floors.step(3)                     // advance 3 s of game time and draw
floors.auto(true)                  // the autopilot plays the real game
floors.warp(49)                    // fast-forward with the autopilot to floor 49 (no drawing)
floors.buddy()                     // call the buddy like his button; floors.buddy(false) only reports
floors.hurt('spike')               // force a hazard: 'spike', 'ceiling' or 'fall'
floors.celebrate(50)               // play the floor-50 celebration
floors.peek(14)                    // a close-up camera 14 m from the kid; floors.peek(0) puts it back
floors.info()                      // state, floor, hearts, where the kid is
```

## Files

```
index.html       page, HUD, menus and touch buttons (CSS inline)
js/title.js      the name, in one constant
js/sim.js        the rules, no Three.js: both generators (self-checking), the physics, the planner, the Run
                 (view, ceiling, bottom, hearts, pickups, floors, combos), the autopilot, check() and soak()
js/sfx.js        this game's sounds on Kit.sound.tone / hiss: boing, bounce, crumble, ouch, whistle, save, fanfare...
js/world.js      canvas textures, the cave and the tower, platforms, the spiky ceiling, pickups, signs, decorations,
                 particles, POW bursts and the pop-up hoop
js/hero.js       a kid on screen: side-on poses, the flip, the balloon, the celebration loop with 💥, ✌️ and the 🏀
js/game.js       states, camera, input, the buddy, HUD, bests, window.floors
tools/check.js   the headless fairness check and soak (node)
kit/             copy of ~/claude-games/kit (python3 ../kit/tools/sync.py .); don't edit it here
dist/hundred-floors.html   the single-page build
```

## Kit candidates

These live in this game for now. Move them into `~/claude-games/kit` if another game wants them:

- **Balloon** (`balloon` in `js/hero.js`): a shiny balloon on a string tied to a character's back, so his hands stay free for his signature move. Any game where the buddy flies could use it.
- **Celebration loop with props** (`segment`, `updateBall` in `js/hero.js`): the roster signature moves in turn, a 💥 on each boxing beat, ✌️ and ⭐ for Tommy, and a jump shot aimed into a pop-up hoop (`hoop` in `js/world.js`). Flappy, Fruit and Magic 8 each have their own version; one shared helper would do.
- **Standing poses** (`standPose` in `js/hero.js`): `wave` and `peace` stride while they pose, so a standing kid settles his legs. Every sibling has written this; a `still` option for `Kit.people.pose` would do it.
- **Point particles with their own size and colour** (`makePoints` in `js/world.js`): one draw call for dust, sparkles and confetti, with sizes in metres.
- **POW burst texture** (`burstTexture` in `js/world.js`): the comic starburst with a word, also in King of Bonk.
- **Self-checking generator + planner** (`js/sim.js`): try a handful of simple input plans with the real physics. It's handy for any platformer's level check, and for an autopilot.
- **Sounds** in `js/sfx.js`: boing, bounce, crumble, ouch, slide whistle, saved, balloon, fanfare, combo.

## Not verified

- **Sound:** the effects and music run through the kit's Web Audio, but nobody has listened to them yet (the test browser can't play audio).
- **Real touch devices and tilt:** the halves of the screen, the JUMP and buddy buttons, and the phone portrait and iPad layouts were tested in the Browser pane's device emulation with synthetic pointer events, not with fingers on a real iPhone or iPad. Tilt steering (and the iOS motion permission prompt) needs a real device and hasn't been tried.
- **Playing it by hand:** the gameplay was checked by the autopilot and by scripted inputs, not by a person; the speeds are a first guess for an 8- and a 5-year-old.
