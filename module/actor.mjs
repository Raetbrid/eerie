/**
 * actor.mjs — eerie Character Sheet
 */
export class eerieCharacterSheet extends ActorSheet {
  constructor(...args) {
    super(...args);
    this.editMode = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eerie", "sheet", "actor"],
      template: "systems/eerie/templates/actor/character-sheet.hbs",
      width: 900,
      height: 920,
      resizable: false,
      dragDrop: [{ dragSelector: ".item-wrapper", dropSelector: null }],
      tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "page1" }]
    });
  }

  async _render(force, options) {
    const isCompact = game.user.getFlag("eerie", `compact-${this.actor.id}`) || false;
    const isInvExpanded = game.user.getFlag("eerie", `compact-inventory-${this.actor.id}`) || false;

    if (isCompact) {
      this.position.width = 520;
      this.position.height = isInvExpanded ? "auto" : 200;
    } else {
      this.position.width = 900;
      this.position.height = 920;
    }

    await super._render(force, options);

    if (isCompact && isInvExpanded) {
      this.setPosition({ height: "auto" });
    }
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
    context.initiativeEnabled = game.settings.get("eerie", "initiative");

    context.compactMode = game.user.getFlag("eerie", `compact-${this.actor.id}`) || false;
    context.compactInventoryExpanded = game.user.getFlag("eerie", `compact-inventory-${this.actor.id}`) || false;

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
        if (this.actor.system[`${s}Temp`] > formData[k]) {
          formData[tempK] = formData[k];
        }
      }
    });
    return super._updateObject(event, formData);
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.toggle-edit-mode').click(() => {
      this.editMode = !this.editMode;
      this.render(false);
    });

    html.find('.toggle-compact-mode').click(async ev => {
      ev.preventDefault();
      const current = game.user.getFlag("eerie", `compact-${this.actor.id}`) || false;
      const target = !current;
      await game.user.setFlag("eerie", `compact-${this.actor.id}`, target);
      this.render(false);
    });

    html.find('.toggle-compact-inventory').click(async ev => {
      ev.preventDefault();
      const current = game.user.getFlag("eerie", `compact-inventory-${this.actor.id}`) || false;
      const target = !current;
      await game.user.setFlag("eerie", `compact-inventory-${this.actor.id}`, target);
      this.render(false);
    });

    html.find('.stat-box-image, .stat-indicator')
      .on('contextmenu', e => e.preventDefault())
      .mousedown(this._onTempStatClick.bind(this));

    html.find('.item-ticks')
      .on('contextmenu', e => e.preventDefault())
      .mousedown(this._onItemTicksClick.bind(this));

    html.find('.rollable-stat')
      .on('contextmenu', e => e.preventDefault())
      .mousedown(ev => {
        const stat = ev.currentTarget.dataset.stat;
        if (ev.button === 0) this._rollStat(stat);
        else if (ev.button === 2) this._onResetInitiative(stat);
      });

    html.find('.item-name.eerie-rollable')
      .on('contextmenu', e => e.preventDefault())
      .mousedown(ev => {
        const li = $(ev.currentTarget).closest('.inventory-item');
        const item = this.actor.items.get(li.data("itemId"));
        if (!item) return;

        if (ev.button === 0) {
          if (item.system.subType === "eerie") this._onEerieItemRoll(item);
          else if (item.system.weaponType !== "none") this._rollStat(item.system.weaponType, item);
        } else if (ev.button === 2) {
          if (game.settings.get("eerie", "advancedRoll") && item.system.weaponType !== "none") {
            this._onAdvancedRoll(item);
          }
        }
      });

    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.item-chat').click(this._onItemToChat.bind(this));
    html.find('.eerie-resource-indicator').on('contextmenu', e => e.preventDefault()).mousedown(this._onEerieResourceClick.bind(this));
    html.find('.resource-count-click').on('contextmenu', e => e.preventDefault()).mousedown(this._onCountResourceClick.bind(this));
    html.find('.resource-dice-click').click(this._onDiceResourceClick.bind(this));

    html.find('input[type="checkbox"]').change(async ev => {
      const n = ev.currentTarget.name;
      if (!ev.currentTarget.checked) return;
      let u = {};
      if (n === "system.modifiers.plusOne") u["system.modifiers.minusOne"] = false;
      if (n === "system.modifiers.minusOne") u["system.modifiers.plusOne"] = false;
      if (n === "system.modifiers.increased") u["system.modifiers.reduced"] = false;
      if (n === "system.modifiers.reduced") u["system.modifiers.increased"] = false;
      if (Object.keys(u).length > 0) await this.actor.update(u);
    });
  }

  /* -------------------------------------------- */
  /*  ADVANCED ROLL DIALOG                        */
  /* -------------------------------------------- */

  async _onAdvancedRoll(item) {
    const template = `
      <form style="font-family: sans-serif;">
        <div class="form-group">
          <label><input type="checkbox" id="adv-penalty" checked /> <b>−1d when using this approach.</b></label>
        </div>
        <hr>
        <button type="button" class="adv-btn" data-mode="ticks1"><b>${game.i18n.localize("EERIE.AdvRoll1")}</b>${game.i18n.localize("EERIE.AdvRoll1Hint")}</button>
        <button type="button" class="adv-btn" data-mode="ticks2"><b>${game.i18n.localize("EERIE.AdvRoll2")}</b>${game.i18n.localize("EERIE.AdvRoll2Hint")}</button>
        <button type="button" class="adv-btn" data-mode="deplete"><b>${game.i18n.localize("EERIE.AdvRollDeplete")}</b>${game.i18n.localize("EERIE.AdvRollDepleteHint")}</button>
        <button type="button" class="adv-btn" data-mode="precise"><b>${game.i18n.localize("EERIE.AdvRollPrecise")}</b>${game.i18n.localize("EERIE.AdvRollPreciseHint")}</button>
      </form>
      <style>
        .adv-btn { margin-bottom: 6px; text-align: left; padding: 8px; height: auto; line-height: 1.2; width: 100%; cursor: pointer; }
        .adv-btn b { color: #8b0000; display: block; font-size: 13px; text-transform: uppercase; }
      </style>
    `;

    const dlg = new Dialog({
      title: `Advanced Action: ${item.name}`,
      content: template,
      buttons: {},
      render: html => {
        html.find('.adv-btn').click(ev => {
          const mode = ev.currentTarget.dataset.mode;
          const penalty = html.find('#adv-penalty').is(':checked');
          dlg.close();
          this._rollStat(item.system.weaponType, item, { mode, penalty });
        });
      }
    });
    dlg.render(true);
  }

  /* -------------------------------------------- */
  /*  CORE ROLL LOGIC                             */
  /* -------------------------------------------- */

  async _rollStat(stat, weapon = null, advanced = null) {
    const val = this.actor.system[`${stat}Temp`] || 0;
    const charMods = this.actor.system.modifiers;
    const globalRule = game.settings.get("eerie", "initiative");
    const actorRule = this.actor.system.initiative?.active ?? true;
    const initiativeActive = globalRule && actorRule;

    let customLabel = this.actor.system[`${stat}Label` || ""];
    let statName = customLabel ? customLabel.toUpperCase() : game.i18n.localize(`EERIE.${stat.charAt(0).toUpperCase() + stat.slice(1)}`).toUpperCase();
    if (statName.includes("EERIE.")) statName = stat.toUpperCase();

    let head = weapon ? weapon.name.toUpperCase() : statName;
    let subHead = weapon ? ` (${statName})` : "";
    let severityBonus = weapon ? (weapon.system.severity || 0) : 0;

    let hasPlus = charMods.plusOne;
    let hasMinus = charMods.minusOne;
    let hasDisadv = charMods.disadvantage;

    // Initiative Disadvantage
    if (initiativeActive && (stat === 'body' || stat === 'mind')) {
      if (this.actor.system.initiative?.[`${stat}Lost`]) {
        hasDisadv = true;
        subHead += " [LOST INITIATIVE]";
      }
    }

    // Weapon Logic
    if (weapon) {
      if (!weapon.system.unreliable) hasPlus = true;
      if (weapon.system.versatile) hasMinus = false;
    }

    // Advanced Roll Penalty
    if (advanced && advanced.penalty) {
      const isVersatile = weapon && weapon.system.versatile;
      const isUnreliable = weapon && weapon.system.unreliable;
      if (!isVersatile && (val === 2 || isUnreliable)) {
        hasMinus = true;
      }
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

    if (hasDisadv && n > 1) {
      if (n === 3 && drop === 1) drop = 2;
      else if (drop === 0) drop = 1;
    }

    const roll = await new Roll(`${n}d6${drop > 0 ? "dh" + drop : ""}`).evaluate();
    const activeResults = roll.terms[0].results.filter(d => d.active).map(d => d.result).sort((a, b) => b - a);

    // Multi-Result logic
    let maxResults = weapon ? parseInt(weapon.system.multiResult || 1) : 1;
    if (advanced && advanced.mode === "deplete") {
      maxResults = 3;
      await weapon.update({"system.tracker.value": weapon.system.tracker.max});
    }

    const successes = activeResults.filter(r => r >= 4);
    const resultsToDisplay = (maxResults > 1 && successes.length > 1) ? successes.slice(0, maxResults) : [activeResults[0] || 0];

    let resBlocksHtml = "";
    let bestResCl = "res-fail";

    resultsToDisplay.forEach((res, index) => {
      let resT = "", resC = "", resCl = "res-fail", baseDots = 0, disp = res;
      const sixes = activeResults.filter(d => d === 6).length;

      if (index === 0 && sixes >= 2) { 
        resT = "CRITICAL"; resC = "#006400"; disp = "6&6"; resCl = "res-crit"; baseDots = 3; 
        if (game.settings.get("eerie", "critRelief")) {
          let u = {};
          if (this.actor.system.willTemp < this.actor.system.will) u["system.willTemp"] = this.actor.system.willTemp + 1;
          if (this.actor.system.mindTemp < this.actor.system.mind) u["system.mindTemp"] = this.actor.system.mindTemp + 1;
          this.actor.update(u);
        }
      }
      else if (res === 6) { resT = "SUCCESS"; resC = "#00008b"; resCl = "res-success"; baseDots = 2; }
      else if (res >= 4) { resT = "PARTIAL"; resC = "#8b4513"; resCl = "res-partial"; baseDots = 1; }
      else { resT = "FAILURE"; resC = "#8b0000"; baseDots = 0; }

      if (index === 0) bestResCl = resCl;

      let extraTicks = (advanced?.mode === "ticks1") ? 1 : (advanced?.mode === "ticks2" ? 2 : 0);
      let dotsHtml = "";
      if (resCl !== "res-fail") {
        let effMod = (charMods.increased || weapon) ? 1 : 0;
        if (charMods.reduced) effMod -= 1; 
        let totalDots = Math.max(0, baseDots + effMod + severityBonus + extraTicks);
        dotsHtml = '<div class="eff-dots-tray">';
        for (let i = 0; i < totalDots; i++) dotsHtml += '<span class="eff-dot">●</span>';
        dotsHtml += '</div>';
      }

      resBlocksHtml += `<div class="roll-result-body ${resCl}" style="${resultsToDisplay.length > 1 ? 'height: 120px; margin-bottom:5px;' : ''}"><div class="result-number">${disp}</div><div class="result-text" style="color:${resC}">${resT}</div>${dotsHtml}</div>`;
    });

    // Update Initiative
    if (initiativeActive && (stat === 'body' || stat === 'mind')) {
      let initUpdates = {};
      if (bestResCl === "res-fail") initUpdates[`system.initiative.${stat}Lost`] = true;
      else { initUpdates["system.initiative.bodyLost"] = false; initUpdates["system.initiative.mindLost"] = false; }
      await this.actor.update(initUpdates);
    }

    const dice = roll.terms[0].results.map(d => `<span class="die ${d.active ? '' : 'die-discarded'}">${d.result}</span>`).join("");
    
    let preciseBtn = "";
    if (advanced?.mode === "precise") {
      preciseBtn = `<hr><a class="reroll-precise" data-actor-id="${this.actor.id}" data-item-id="${weapon.id}" data-penalty="${advanced.penalty}" style="display:block; background:rgba(0,0,0,0.1); padding:5px; border:1px solid #000; font-family:'TitleFont'; text-align:center; cursor:pointer;">${game.i18n.localize("EERIE.WillReroll")}</a>`;
    }

    const content = `<div class="eerie-roll-card"><div class="roll-header">${head}${subHead} CHECK</div>${resBlocksHtml}<div class="roll-dice-tray">${dice}</div>${preciseBtn}</div>`;

    // Tracker auto-fill
    if (weapon && weapon.id && game.settings.get("eerie", "itemTracker") && advanced?.mode !== "deplete") {
      const item = this.actor.items.get(weapon.id);
      if (item && item.system.tracker.max > 0) {
        let add = 0;
        if (!item.system.tracker.inverted) {
          if (bestResCl === "res-fail") add = 2; else if (bestResCl === "res-partial") add = 1;
        } else {
          if (bestResCl === "res-partial") add = 1; else if (bestResCl === "res-success" || bestResCl === "res-crit") add = 2;
        }
        if (add > 0) await item.update({ "system.tracker.value": Math.min((item.system.tracker.value || 0) + add, item.system.tracker.max) });
      }
    }
    
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  /* -------------------------------------------- */
  /*  HANDLERS                                    */
  /* -------------------------------------------- */

  async _onResetInitiative(stat) {
    if (game.settings.get("eerie", "initiative") && (stat === 'body' || stat === 'mind')) {
      await this.actor.update({ [`system.initiative.${stat}Lost`]: false });
      ui.notifications.info(`${stat.toUpperCase()} Initiative restored.`);
    }
  }

  _onTempStatClick(ev) {
    const k = ev.currentTarget.dataset.statTemp;
    let v = this.actor.system[k] || 0;
    const m = this.actor.system[k.replace('Temp', '')] || 0;
    if (ev.button === 0) v = Math.min(v + 1, m); else v = Math.max(v - 1, 0);
    this.actor.update({ [`system.${k}`]: v });
  }

  async _onItemTicksClick(ev) {
    const li = $(ev.currentTarget).closest('.inventory-item');
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;
    let val = item.system.tracker.value || 0;
    const max = item.system.tracker.max || 0;
    if (ev.button === 0) { if (val >= max) val = 0; else val = Math.min(val + 1, max); }
    else if (ev.button === 2) { val = Math.max(val - 1, 0); }
    await item.update({ "system.tracker.value": val });
  }

  async _onEerieResourceClick(ev) {
    const li = $(ev.currentTarget).closest(".inventory-item");
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;
    let val = item.system.eerie?.value || 0;
    if (ev.button === 0) val = Math.min(val + 1, 3); else if (ev.button === 2) val = Math.max(val - 1, 0);
    await item.update({ "system.eerie.value": val });
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

  async _onCountResourceClick(ev) {
    const item = this.actor.items.get(ev.currentTarget.closest('.item-wrapper').dataset.itemId);
    let v = item.system.count.value;
    v = (ev.button === 0) ? Math.min(v + 1, item.system.count.max) : Math.max(v - 1, 0);
    await item.update({ "system.count.value": v });
  }

  async _onDiceResourceClick(ev) {
    const item = this.actor.items.get(ev.currentTarget.closest('.item-wrapper').dataset.itemId);
    if (!item || item.system.dice.rank === "0") return;
    const roll = await new Roll(`1${item.system.dice.rank}`).evaluate();
    roll.toMessage({ flavor: item.name });
    if (roll.total <= item.system.dice.n) {
      const ranks = ["0", "d4", "d6", "d8", "d10", "d12"];
      await item.update({ "system.dice.rank": ranks[Math.max(0, ranks.indexOf(item.system.dice.rank) - 1)] });
    }
  }

  _onItemEdit(ev) { 
    const id = ev.currentTarget.closest('.item-wrapper, .condition-box, .inventory-item')?.dataset.itemId; 
    if (id) this.actor.items.get(id)?.sheet.render(true); 
  }
  
  async _onItemDelete(ev) { 
    ev.stopPropagation(); 
    const id = ev.currentTarget.closest('.item-wrapper, .condition-box, .inventory-item')?.dataset.itemId; 
    if (id && await Dialog.confirm({ title: "Delete?", content: "Are you sure?" })) await this.actor.deleteEmbeddedDocuments("Item", [id]); 
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    if (type === "trait" || type === "feat") {
      if (this.actor.items.filter(i => i.type === type).length >= 1) return ui.notifications.warn("Already has one!");
      return type === "trait" ? this._showTraitPicker() : this._showFeatCategoryPicker();
    }
    if (type === "item") return await this.actor.createEmbeddedDocuments("Item", [{ name: "New Item", type: "item" }]);
    const count = this.actor.items.filter(i => i.type === type).length;
    if (count >= 3) return ui.notifications.warn("No more slots");
    const targetLevel = count + 1;
    const pack = game.packs.get("eerie.conds");
    let itemData = null;
    if (pack) {
      const index = await pack.getIndex({fields: ["system.level"]});
      const entry = index.find(e => e.type === type && Number(e.system?.level) === targetLevel);
      if (entry) { const doc = await pack.getDocument(entry._id); itemData = doc.toObject(); }
    }
    if (!itemData) itemData = { name: `${type} ${targetLevel}`, type: type, system: { level: targetLevel, description: "No description." } };
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  async _onItemToChat(event) {
    const itemId = event.currentTarget.closest('.item-wrapper, .condition-box, .inventory-item').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const chatContent = `<div class="eerie-roll-card"><div class="roll-header">${item.type.toUpperCase()} INFO</div><div class="item-chat-body" style="text-align: left; padding: 10px; background: rgba(0,0,0,0.03); border: 1px solid #000;"><div style="font-weight: bold; font-size: 18px; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize(item.name)}</div><div style="font-size: 14px; line-height: 1.4; white-space: pre-wrap;">${game.i18n.localize(item.system.description)}</div></div></div>`;
    ChatMessage.create({ user: game.user._id, speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: chatContent });
  }

  async _onGeneratorRoll(event) {
    event.preventDefault();
    const pack = game.packs.get("eerie.tables"); 
    if (!pack) return ui.notifications.error("eerie.tables pack not found");
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