import { eerieCharacterSheet } from "./actor.mjs";

export class eerieNPCSheet extends eerieCharacterSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eerie", "sheet", "actor", "npc"],
      template: "systems/eerie/templates/actor/npc-sheet.hbs",
      width: 850, 
      height: 700
    });
  }

  getData() {
    const context = super.getData();
    const sys = context.system;

    sys.bodyLabel = sys.bodyLabel || game.i18n.localize("EERIE.Body") || "BODY";
    sys.mindLabel = sys.mindLabel || game.i18n.localize("EERIE.Mind") || "MIND";
    sys.willLabel = sys.willLabel || game.i18n.localize("EERIE.Will") || "WILL";

    sys.body = sys.body ?? 2;
    sys.mind = sys.mind ?? 2;
    sys.will = sys.will ?? 2;
    sys.bodyTemp = sys.bodyTemp ?? sys.body;
    sys.mindTemp = sys.mindTemp ?? sys.mind;
    sys.willTemp = sys.willTemp ?? sys.will;

    return context;
  }
}