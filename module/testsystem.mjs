import { eerieCharacterSheet } from "./actor.mjs";
import { eerieItemSheet } from "./item.mjs";

Hooks.once('init', () => {
  game.settings.register("eerie", "critRelief", { name: "Crit Relief Rule", scope: "world", config: true, type: Boolean, default: true });
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eerie", eerieCharacterSheet, { makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eerie", eerieItemSheet, { makeDefault: true });

  Handlebars.registerHelper({
    eq: (a, b) => a === b,
    lt: (a, b) => a < b,
    add: (a, b) => Number(a) + Number(b),
    length: arr => Array.isArray(arr) ? arr.length : 0,
    get: (array, index) => array[index],
    times: (n, block) => { let out = ""; for (let i = 0; i < n; ++i) out += block.fn(i); return out; }
  });
});