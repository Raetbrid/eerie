import { eerieCharacterSheet } from "./actor.mjs";
import { eerieNPCSheet } from "./npc.mjs";
import { eerieItemSheet } from "./item.mjs";

Hooks.once('init', () => {
  
  game.settings.register("eerie", "critRelief", {
    name: "EERIE.SettingsCritReliefName",
    hint: "EERIE.SettingsCritReliefHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("eerie", "showPersonalityToChat", {
    name: "EERIE.SettingsPersonalityChatName",
    hint: "EERIE.SettingsPersonalityChatHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  
  game.settings.register("eerie", "itemTracker", {
    name: "EERIE.SettingsTrackerName",
    hint: "EERIE.SettingsTrackerHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => location.reload()
  });

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eerie", eerieCharacterSheet, { 
    types: ["character"],
    makeDefault: true,
    label: "EERIE.SheetCharacter" 
  });

  Actors.registerSheet("eerie", eerieNPCSheet, { 
    types: ["npc"],
    makeDefault: true,
    label: "EERIE.SheetNPC" 
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eerie", eerieItemSheet, { 
    makeDefault: true,
    label: "EERIE.SheetItem"
  });

  Handlebars.registerHelper({
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    lt: (a, b) => a < b,
    gte: (a, b) => a >= b,
    and: (a, b) => a && b,
    or: (a, b) => a || b,
    add: (a, b) => Number(a) + Number(b),
    length: arr => Array.isArray(arr) ? arr.length : 0,
    get: (array, index) => Array.isArray(array) ? array[index] : undefined,
    times: function(n, block) { 
      let out = ""; 
      for (let i = 0; i < n; ++i) out += block.fn(i); 
      return out; 
    }
  });

  console.log("Eerie System | Initialized");
});