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

	game.settings.register("eerie", "advancedRoll", {
	  name: "EERIE.SettingsAdvRollName",
	  hint: "EERIE.SettingsAdvRollHint",
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
  
  game.settings.register("eerie", "initiative", {
  name: "EERIE.SettingsInitiativeName",
  hint: "EERIE.SettingsInitiativeHint",
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

Hooks.on("renderChatMessage", (message, html, data) => {
  html.find('.reroll-precise').click(async ev => {
    const actorId = ev.currentTarget.dataset.actorId;
    const itemId = ev.currentTarget.dataset.itemId;
    const penalty = ev.currentTarget.dataset.penalty === "true";
    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);

    if (!actor || !item) return;

    if (actor.system.willTemp > 0) {
      // Вычитаем волю
      await actor.update({"system.willTemp": actor.system.willTemp - 1});
      // Совершаем тот же бросок
      const sheet = actor.sheet;
      sheet._rollStat(item.system.weaponType, item, { 
        mode: "precise", 
        penalty: penalty 
      });
    } else {
      ui.notifications.warn("Not enough Will to reroll!");
    }
  });
});