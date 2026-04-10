import { eerieCharacterSheet } from "./actor.mjs";
import { eerieItemSheet } from "./item.mjs";

Hooks.once('init', () => {
  // === РЕГИСТРАЦИЯ НАСТРОЕК МИРА ===
  game.settings.register("eerie", "critRelief", {
    name: "EERIE.SettingsCritReliefName", // Рекомендую использовать ключи и тут
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

  // === РЕГИСТРАЦИЯ ЛИСТОВ ===
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eerie", eerieCharacterSheet, { 
    makeDefault: true,
    label: "EERIE.SheetCharacter" 
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eerie", eerieItemSheet, { 
    makeDefault: true,
    label: "EERIE.SheetItem"
  });

  // === ХЕЛПЕРЫ HANDLEBARS ===
  Handlebars.registerHelper({
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b, // ДОБАВИЛИ ЭТОТ ХЕЛПЕР (нужен для оружия)
    lt: (a, b) => a < b,
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