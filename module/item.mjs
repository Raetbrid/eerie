export class eerieItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eerie", "sheet", "item"],
      template: "systems/eerie/templates/item/item-sheet.hbs",
      width: 520, height: 480,
      tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }
  getData() { return { ...super.getData(), system: this.item.system }; }
}