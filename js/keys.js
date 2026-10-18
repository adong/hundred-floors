/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: "100 Floors",
  keys: [
    ["move", "← → or A D"],
    ["big jump (UP)", "Space ↑ or W"],
    ["pick a mode and go (title)", "↓ ↑ then Enter"],
    ["call your brother", "T"],
    ["easy mode (title)", "E"],
    ["pause", "P or Esc"],
    ["sound on / off", "M"],
  ],
  touch: "Hold the left or right half of the screen to move, ⤒ JUMP in UP mode, or 📱 TILT. The big face (bottom right) calls your brother.",
});
