/**
 * actor.mjs — eerie Character Sheet
 */
export class eerieCharacterSheet extends ActorSheet {
  constructor(...args) { super(...args); this.editMode = false; }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eerie", "sheet", "actor"],
      template: "systems/eerie/templates/actor/character-sheet.hbs",
      width: 900, height: 920,
      dragDrop: [{ dragSelector: ".item-wrapper", dropSelector: null }],
      tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "page1" }]
    });
  }
  
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();
    buttons.unshift({
      label: game.i18n.localize("EERIE.HeaderGenerator"),
      class: "eerie-header-generator",
      icon: "fas fa-wand-magic-sparkles",
      onclick: ev => this._onGeneratorRoll(ev)
    });
    return buttons;
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    context.items = Array.isArray(this.actor.items?.contents) ? this.actor.items.contents : [];
    context.bodyConditions = context.items.filter(i => i.type === "bodyCondition").slice(0, 3);
    context.mindConditions = context.items.filter(i => i.type === "mindCondition").slice(0, 3);
    context.inventory = context.items.filter(i => i.type === "item");
    context.editMode = this.editMode;
    context.itemTrackerEnabled = game.settings.get("eerie", "itemTracker");
    return context;
  }

  async _updateObject(event, formData) {
    const stats = ['will', 'body', 'mind'];
    stats.forEach(s => {
      const k = `system.${s}`;
      if (formData[k] !== undefined) {
        let val = parseInt(formData[k]) || 0;
        formData[k] = Math.max(0, Math.min(val, 3));
        const tempK = `system.${s}Temp`;
        if (this.actor.system[`${s}Temp`] > formData[k]) { formData[tempK] = formData[k]; }
      }
    });
    return super._updateObject(event, formData);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.toggle-edit-mode').click(() => { this.editMode = !this.editMode; this.render(false); });
    html.find('.stat-box-image, .stat-indicator').on('contextmenu', e => e.preventDefault()).mousedown(this._onTempStatClick.bind(this));
    html.find('.item-ticks').on('contextmenu', e => e.preventDefault()).mousedown(this._onItemTicksClick.bind(this));
	
    // Клик по имени только для роллабильных (Инструмент и Eerie)
    html.find('.item-name.eerie-rollable').click(ev => {
      const li = $(ev.currentTarget).closest('.inventory-item');
      const item = this.actor.items.get(li.data("itemId"));
      if (!item) return;

      if (item.system.subType === "eerie") { 
        this._onEerieItemRoll(item); 
      }
      else if (item.system.weaponType && item.system.weaponType !== "none") {
        this._rollStat(item.system.weaponType, item);
      }
    });

    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.rollable-stat').click(ev => this._rollStat(ev.currentTarget.dataset.stat));
    html.find('.resource-count-click').on('contextmenu', e => e.preventDefault()).mousedown(this._onCountResourceClick.bind(this));
    html.find('.resource-dice-click').click(this._onDiceResourceClick.bind(this));
    html.find('.item-chat').click(this._onItemToChat.bind(this));
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.eerie-resource-indicator').on('contextmenu', e => e.preventDefault()).mousedown(this._onEerieResourceClick.bind(this));

    html.find('input[type="checkbox"]').change(async ev => {
      const n = ev.currentTarget.name; if (!ev.currentTarget.checked) return;
      let u = {};
      if (n === "system.modifiers.plusOne") u["system.modifiers.minusOne"] = false;
      if (n === "system.modifiers.minusOne") u["system.modifiers.plusOne"] = false;
      if (n === "system.modifiers.increased") u["system.modifiers.reduced"] = false;
      if (n === "system.modifiers.reduced") u["system.modifiers.increased"] = false;
      if (Object.keys(u).length > 0) await this.actor.update(u);
      
      if (n.includes("eerie.plusOne") || n.includes("eerie.minusOne")) {
        const itemId = $(ev.currentTarget).closest('.inventory-item').data("itemId");
        const item = this.actor.items.get(itemId);
        if (item) { await item.update({ [n.includes("plusOne") ? "system.eerie.minusOne" : "system.eerie.plusOne"]: false }); }
      }
    });
  }

  async _onEerieResourceClick(ev) {
    const li = $(ev.currentTarget).closest(".inventory-item");
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;
    let val = item.system.eerie?.value || 0;
    if (ev.button === 0) val = Math.min(val + 1, 3); else if (ev.button === 2) val = Math.max(val - 1, 0);
    await item.update({ "system.eerie.value": val });
  }
  
  async _onItemTicksClick(ev) {
    const li = $(ev.currentTarget).closest('.inventory-item');
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;
    let val = item.system.tracker.value || 0;
    const max = item.system.tracker.max || 0;
    if (ev.button === 0) { 
      if (val >= max) val = 0; else val = Math.min(val + 1, max);
    } else if (ev.button === 2) { 
      val = Math.max(val - 1, 0);
    }
    await item.update({ "system.tracker.value": val });
  }

  async _onEerieItemRoll(item) {
    const eerie = item.system.eerie;
    const val = parseInt(eerie?.value) || 0;
    const isSturdy = eerie?.sturdy || false;
    const isExpendable = eerie?.expendable || false;
    let scarcityMod = (eerie?.plusOne ? 1 : 0) + (eerie?.minusOne ? -1 : 0);
    const totalLevel = val + scarcityMod;
    let diceCount = totalLevel <= 0 ? 2 : Math.min(totalLevel, 3);
    let forceDisadvantage = totalLevel <= 0 || isSturdy;

    const roll = await new Roll(`${diceCount}d6`).evaluate({ async: true });
    let results = roll.terms[0].results.map(r => r.result).sort((a, b) => b - a);
    let finalResult = (forceDisadvantage && results.length > 1) ? results[1] : results[0];

    if ((isExpendable ? finalResult <= 5 : finalResult <= 3) && val > 0) {
      await item.update({ "system.eerie.value": val - 1 });
      ui.notifications.warn(`${item.name}: Resource decreased!`);
    }

    let resT = "", resC = "", resCl = "res-fail";
    if (finalResult === 6) { resT = "SUCCESS"; resC = "#00008b"; resCl = "res-success"; }
    else if (finalResult >= 4) { resT = "PARTIAL"; resC = "#8b4513"; resCl = "res-partial"; }
    else { resT = "FAILURE"; resC = "#8b0000"; resCl = "res-fail"; }

    const diceHtml = roll.terms[0].results.map(d => {
      const isDiscarded = forceDisadvantage && d.result === Math.max(...roll.terms[0].results.map(r => r.result));
      return `<span class="die ${isDiscarded ? 'die-discarded' : ''}">${d.result}</span>`;
    }).join("");

    const content = `<div class="eerie-roll-card"><div class="roll-header">${item.name.toUpperCase()}</div><div class="roll-result-body ${resCl}"><div class="result-number">${finalResult}</div><div class="result-text" style="color:${resC}">${resT}</div></div><div class="roll-dice-tray">${diceHtml}</div></div>`;
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  _onItemEdit(ev) { const id = ev.currentTarget.closest('.item-wrapper, .condition-box, .inventory-item')?.dataset.itemId; if (id) this.actor.items.get(id)?.sheet.render(true); }
  async _onItemDelete(ev) { ev.stopPropagation(); const id = ev.currentTarget.closest('.item-wrapper, .condition-box, .inventory-item')?.dataset.itemId; if (id && await Dialog.confirm({ title: "Delete?", content: "Are you sure?" })) await this.actor.deleteEmbeddedDocuments("Item", [id]); }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    if (!type) return;
    if (type === "trait" || type === "feat") {
      if (this.actor.items.filter(i => i.type === type).length >= 1) return ui.notifications.warn("Already has one!");
      return type === "trait" ? this._showTraitPicker() : this._showFeatCategoryPicker();
    }
    if (type === "item") return await this.actor.createEmbeddedDocuments("Item", [{ name: "New Item", type: "item" }]);
    const count = this.actor.items.filter(i => i.type === type).length;
    if (count >= 3) return ui.notifications.warn("Слоты заполнены");
    const targetLevel = count + 1;
    const pack = game.packs.get("eerie.conds");
    let itemData = null;
    if (pack) {
      const index = await pack.getIndex({fields: ["system.level"]});
      const entry = index.find(e => e.type === type && Number(e.system?.level) === targetLevel);
      if (entry) { const doc = await pack.getDocument(entry._id); itemData = doc.toObject(); }
    }
    if (!itemData) itemData = { name: `${type} ${targetLevel}`, type: type, system: { level: targetLevel, description: "Описание не найдено." } };
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  async _rollStat(stat, weapon = null) {
    const val = this.actor.system[`${stat}Temp`] || 0;
    const charMods = this.actor.system.modifiers;
    let severityBonus = 0;

    // ОПРЕДЕЛЕНИЕ НАЗВАНИЯ ХАРАКТЕРИСТИКИ (Label)
    let customLabel = this.actor.system[`${stat}Label`];
    let statName = customLabel ? customLabel.toUpperCase() : game.i18n.localize(`EERIE.${stat.charAt(0).toUpperCase() + stat.slice(1)}`).toUpperCase();
    if (statName.includes("EERIE.")) statName = stat.toUpperCase();

    // Заголовок карточки
    let head = weapon ? weapon.name.toUpperCase() : statName;
    let subHead = weapon ? ` (${statName})` : "";

    // ЛОГИКА МОДИФИКАТОРОВ КУБОВ
    let hasPlus = charMods.plusOne;
    let hasMinus = charMods.minusOne;
    let hasDisadv = charMods.disadvantage;

    if (weapon && weapon.id) {
      severityBonus = weapon.system.severity || 0;
      if (!weapon.system.unreliable) hasPlus = true;
      if (weapon.system.versatile) hasMinus = false;
    }

    let finalDiceMod = (hasPlus ? 1 : 0) + (hasMinus ? -1 : 0);

    let n = 0, drop = 0;
    if (val === 0) {
      if (finalDiceMod === 1) n = 1; 
      else if (finalDiceMod === -1) { n = 3; drop = 2; subHead += " [-1]"; } 
      else { n = 2; drop = 1; subHead += " [ZERO]"; }
    } else {
      n = Math.min(Math.max(val + finalDiceMod, 0), 3);
      if (n === 0) { n = 2; drop = 1; subHead += " [ZERO]"; }
    }

    if (hasDisadv && n > 1) { if (n === 3 && drop === 1) drop = 2; else if (drop === 0) drop = 1; }

    const roll = await new Roll(`${n}d6${drop > 0 ? "dh" + drop : ""}`).evaluate();
    const active = roll.terms[0].results.filter(d => d.active).map(d => d.result);
    const best = active.length ? Math.max(...active) : 0;
    const sixes = active.filter(d => d === 6).length;

    let resT = "", resC = "", disp = best, resCl = "res-fail", baseDots = 0;
    if (sixes >= 2) { resT = game.i18n.format("EERIE.ChatCritical"); resC = "#006400"; disp = "6&6"; resCl = "res-crit"; baseDots = 3; }
    else if (best === 6) { resT = game.i18n.format("EERIE.ChatSuccess"); resC = "#00008b"; resCl = "res-success"; baseDots = 2; }
    else if (best >= 4) { resT = game.i18n.format("EERIE.ChatPartial"); resC = "#8b4513"; resCl = "res-partial"; baseDots = 1; }
    else { resT = game.i18n.format("EERIE.ChatFail"); resC = "#8b0000"; resCl = "res-fail"; baseDots = 0; }

    // ЛОГИКА ЭФФЕКТИВНОСТИ
    let finalDots = 0;
    if (resCl !== "res-fail") {
      let effMod = 0;
      let weaponIncreased = weapon ? true : false;
      if (charMods.increased || weaponIncreased) effMod = 1;
      if (charMods.reduced) effMod -= 1; 
      finalDots = Math.max(0, baseDots + effMod + severityBonus);
    }

    let dotsHtml = '<div class="eff-dots-tray">';
    for (let i = 0; i < finalDots; i++) dotsHtml += '<span class="eff-dot">●</span>';
    dotsHtml += '</div>';

    const dice = roll.terms[0].results.map(d => `<span class="die ${d.active ? '' : 'die-discarded'}">${d.result}</span>`).join("");
    const content = `<div class="eerie-roll-card"><div class="roll-header">${head}${subHead} CHECK</div><div class="roll-result-body ${resCl}"><div class="result-number">${disp}</div><div class="result-text" style="color:${resC}">${resT}</div>${dotsHtml}</div><div class="roll-dice-tray">${dice}</div></div>`;

    // ТИКИ ТРЕКЕРА
    if (weapon && weapon.id && game.settings.get("eerie", "itemTracker")) {
      const item = this.actor.items.get(weapon.id);
      if (item && item.system.tracker.max > 0) {
        let add = 0;
        if (!item.system.tracker.inverted) {
          if (resCl === "res-fail") add = 2; else if (resCl === "res-partial") add = 1;
        } else {
          if (resCl === "res-partial") add = 1; else if (resCl === "res-success" || resCl === "res-crit") add = 2;
        }
        if (add > 0) {
          await item.update({ "system.tracker.value": Math.min((item.system.tracker.value || 0) + add, item.system.tracker.max) });
        }
      }
    }
    
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  async _onCountResourceClick(ev) {
    const item = this.actor.items.get(ev.currentTarget.closest('.item-wrapper').dataset.itemId);
    let v = item.system.count.value;
    v = (ev.button === 0) ? Math.min(v + 1, item.system.count.max) : Math.max(v - 1, 0);
    await item.update({ "system.count.value": v });
  }

  async _onDiceResourceClick(ev) {
    const item = this.actor.items.get(ev.currentTarget.closest('.item-wrapper').dataset.itemId);
    if (item.system.dice.rank === "0") return;
    const roll = await new Roll(`1${item.system.dice.rank}`).evaluate();
    roll.toMessage({ flavor: item.name });
    if (roll.total <= item.system.dice.n) {
      const ranks = ["0", "d4", "d6", "d8", "d10", "d12"];
      await item.update({ "system.dice.rank": ranks[Math.max(0, ranks.indexOf(item.system.dice.rank) - 1)] });
    }
  }

  _onTempStatClick(ev) {
    const k = ev.currentTarget.dataset.statTemp;
    let v = this.actor.system[k] || 0;
    const m = this.actor.system[k.replace('Temp', '')] || 0;
    v = (ev.button === 0) ? Math.min(v + 1, m) : Math.max(v - 1, 0);
    this.actor.update({ [`system.${k}`]: v });
  }

  async _onItemToChat(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item-wrapper, .condition-box').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const chatContent = `<div class="eerie-roll-card"><div class="roll-header">${item.type.toUpperCase()} INFO</div><div class="item-chat-body" style="text-align: left; padding: 10px; background: rgba(0,0,0,0.03); border: 1px solid #000;"><div style="font-weight: bold; font-size: 18px; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize(item.name)}</div><div style="font-size: 14px; line-height: 1.4; white-space: pre-wrap;">${game.i18n.localize(item.system.description)}</div></div></div>`;
    ChatMessage.create({ user: game.user._id, speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: chatContent });
  }

  async _onGeneratorRoll(event) {
    event.preventDefault();
    const pack = game.packs.get("eerie.tables"); 
    if (!pack) return ui.notifications.error("Пак eerie.tables не найден!");
    await pack.getIndex();
    const detTable = await pack.getDocument(pack.index.find(e => e.name === "Details")._id);
    const solTable = await pack.getDocument(pack.index.find(e => e.name === "Solace")._id);
    const dRes = await detTable.draw({ displayChat: false });
    const sRes = await solTable.draw({ displayChat: false });
    const clean = (str) => str.replace(/<[^>]*>/g, "").replace(/[\n\r\t]/g, "").replace(/&nbsp;/g, " ").trim();
    const textDet = game.i18n.localize(clean(dRes.results[0].text || ""));
    const textSol = game.i18n.localize(clean(sRes.results[0].text || ""));
    await this.actor.update({ "system.details": textDet, "system.solace": textSol });
    if (game.settings.get("eerie", "showPersonalityToChat")) {
      const chatContent = `<div class="eerie-roll-card"><div class="roll-header">CHARACTER GENERATOR</div><div class="roll-result-body" style="background: rgba(0,0,0,0.05); border: 1px solid #000; padding: 10px;"><div style="font-weight: bold; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize("EERIE.Details")}</div><div style="margin-bottom: 10px; font-style: italic; font-size: 14px;">${textDet}</div><div style="font-weight: bold; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize("EERIE.Solace")}</div><div style="font-size: 14px;">${textSol}</div></div></div>`;
      ChatMessage.create({ user: game.user._id, speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: chatContent });
    }
  }

  _showTraitPicker() {
    const dlg = new Dialog({
      title: "Trait", content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button class="t-btn" data-cat="Body">BODY</button><button class="t-btn" data-cat="Mind">MIND</button></div>`,
      buttons: {}, render: html => html.find('.t-btn').click(ev => { this._showTraitGroupedList(ev.currentTarget.dataset.cat); dlg.close(); })
    });
    dlg.render(true);
  }

  async _showTraitGroupedList(category) {
    const pack = game.packs.get("eerie.traits");
    const index = await pack.getIndex({fields: ["system.category", "system.level", "system.description"]});
    let html = `<div style="max-height: 500px; overflow-y: auto;">`;
    for (let lvl = 1; lvl <= 3; lvl++) {
      html += `<div style="background:#222;color:#fff;padding:5px;font-weight:bold;margin-top:10px;">LEVEL ${lvl}</div>`;
      index.filter(e => e.system.category === category && Number(e.system.level) === lvl).forEach(i => {
        html += `<div class="opt" data-id="${i._id}" style="border:1px solid #999;padding:8px;margin:5px 0;cursor:pointer;background:#fff;color:#000;"><strong>${game.i18n.localize(i.name)}</strong><br><small>${game.i18n.localize(i.system.description || "")}</small></div>`;
      });
    }
    const dlg = new Dialog({
      title: `Traits: ${category}`, content: html + `</div>`, buttons: {},
      render: html => html.find('.opt').click(async ev => { const s = await pack.getDocument(ev.currentTarget.dataset.id); await this.actor.createEmbeddedDocuments("Item", [s.toObject()]); dlg.close(); })
    });
    dlg.render(true);
  }

  _showFeatCategoryPicker() {
    const dlg = new Dialog({
      title: "Feat", content: `<div style="display:flex; flex-direction:column; gap:8px;"><button class="f-btn" data-cat="Physical">PHYSICAL</button><button class="f-btn" data-cat="Intellectual">INTELLECTUAL</button><button class="f-btn" data-cat="Social">SOCIAL</button></div>`,
      buttons: {}, render: html => html.find('.f-btn').click(ev => { this._showFeatGroupPicker(ev.currentTarget.dataset.cat); dlg.close(); })
    });
    dlg.render(true);
  }

  async _showFeatGroupPicker(category) {
    const groupsMap = { "Physical": ["Daredevil", "Gunslinger", "Defender"], "Intellectual": ["Pragmatist", "Penitent", "Resilient"], "Social": ["Ally", "Handler", "Operator"] };
    const pack = game.packs.get("eerie.feats");
    const index = await pack.getIndex({fields: ["system.group", "system.description"]});
    let html = `<div style="max-height: 500px; overflow-y: auto;">`;
    for (const sub of groupsMap[category]) {
      html += `<div style="background:#222;color:#fff;padding:4px;font-weight:bold;margin-top:10px;">${sub.toUpperCase()}</div>`;
      index.filter(e => e.system.group === sub).forEach(i => {
        html += `<div class="opt" data-id="${i._id}" style="border:1px solid #999;padding:8px;margin:5px 0;cursor:pointer;background:#fff;color:#000;"><strong>${game.i18n.localize(i.name)}</strong><br><small>${game.i18n.localize(i.system.description || "")}</small></div>`;
      });
    }
    const dlg = new Dialog({
      title: `Feats: ${category}`, content: html + `</div>`, buttons: {},
      render: html => html.find('.opt').click(async ev => { const s = await pack.getDocument(ev.currentTarget.dataset.id); await this.actor.createEmbeddedDocuments("Item", [s.toObject()]); dlg.close(); })
    });
    dlg.render(true);
  }
}