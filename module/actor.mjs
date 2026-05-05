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
  
  /** @override */
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
    html.find('.toggle-edit-mode').click(() => { this.editMode = !this.editMode; this.render(false); });
    html.find('.stat-box-image, .stat-indicator').on('contextmenu', e => e.preventDefault()).mousedown(this._onTempStatClick.bind(this));
    html.find('.item-name').click(this._onItemEdit.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.rollable-stat').click(ev => this._rollStat(ev.currentTarget.dataset.stat));
    html.find('.resource-count-click').on('contextmenu', e => e.preventDefault()).mousedown(this._onCountResourceClick.bind(this));
    html.find('.resource-dice-click').click(this._onDiceResourceClick.bind(this));
    html.find('.weapon-roll-click').click(this._onWeaponRoll.bind(this));
	html.find('.item-chat').click(this._onItemToChat.bind(this));

    html.find('input[type="checkbox"]').change(async ev => {
      const n = ev.currentTarget.name; if (!ev.currentTarget.checked) return;
      let u = {};
      if (n === "system.modifiers.plusOne") u["system.modifiers.minusOne"] = false;
      if (n === "system.modifiers.minusOne") u["system.modifiers.plusOne"] = false;
      if (n === "system.modifiers.increased") u["system.modifiers.reduced"] = false;
      if (n === "system.modifiers.reduced") u["system.modifiers.increased"] = false;
      if (Object.keys(u).length > 0) await this.actor.update(u);
    });
  }

  async _onWeaponRoll(ev) {
    const itemId = ev.currentTarget.closest('.item-wrapper').dataset.itemId;
    const item = this.actor.items.get(itemId);
    this._rollStat(item.system.weaponType, {
        isWeapon: true,
        weaponName: item.name,
        severity: item.system.severity
    });
  }

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
      
      if (entry) {
        const doc = await pack.getDocument(entry._id);
        
        itemData = doc.toObject(); 
        
        console.log(`Eerie | В персонажа записан ключ: ${itemData.name}`);
      }
    }

    if (!itemData) {
      itemData = { 
        name: `${type === "bodyCondition" ? "Body" : "Mind"} ${targetLevel}`, 
        type: type, 
        system: { level: targetLevel, description: "Описание не найдено." }
      };
      ui.notifications.warn(`Предмет уровня ${targetLevel} не найден в компендиуме.`);
    }

    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  _showTraitPicker() {
    const dlg = new Dialog({
      title: "Trait", content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button class="t-btn" data-cat="Body">BODY</button><button class="t-btn" data-cat="Mind">MIND</button></div>`,
      buttons: {}, render: html => html.find('.t-btn').click(ev => { dlg.close(); this._showTraitGroupedList(ev.currentTarget.dataset.cat); })
    }).render(true);
  }

  async _showTraitGroupedList(category) {
    const pack = game.packs.get("eerie.traits");
    if (!pack) return ui.notifications.error("Пак Traits не найден!");
    
    const index = await pack.getIndex({fields: ["system.category", "system.level", "system.description"]});
    
    let listHtml = `<div style="max-height: 500px; overflow-y: auto;">`;
    for (let lvl = 1; lvl <= 3; lvl++) {
      listHtml += `<div style="background:#222;color:#fff;padding:5px;font-weight:bold;margin-top:10px;">${category.toUpperCase()} LEVEL ${lvl}</div>`;
      
      const filtered = index.filter(e => e.system.category === category && Number(e.system.level) === lvl);
      
      if (filtered.length === 0) {
        listHtml += `<div style="font-size: 10px; padding: 5px;">Нет данных.</div>`;
      } else {
        filtered.forEach(i => {
          const name = game.i18n.localize(i.name);
          const desc = game.i18n.localize(i.system.description || "");

          listHtml += `
            <div class="opt" data-id="${i._id}" style="border:1px solid #999;padding:8px;margin:5px 0;cursor:pointer;background:#fff;color:#000;">
              <strong>${name}</strong><br>
              <small>${desc}</small>
            </div>`;
        });
      }
    }
    listHtml += `</div>`;

    const dlg = new Dialog({
      title: `Traits: ${category}`, 
      content: listHtml, 
      buttons: {},
      render: html => {
        html.find('.opt').click(async ev => { 
          const selected = await pack.getDocument(ev.currentTarget.dataset.id); 
          await this.actor.createEmbeddedDocuments("Item", [selected.toObject()]); 
          dlg.close(); 
        });
      }
    }, { width: 450 }).render(true);
  }

  _showFeatCategoryPicker() {
    const dlg = new Dialog({
      title: "Feat", content: `<div style="display:flex; flex-direction:column; gap:8px;"><button class="f-btn" data-cat="Physical">PHYSICAL</button><button class="f-btn" data-cat="Intellectual">INTELLECTUAL</button><button class="f-btn" data-cat="Social">SOCIAL</button></div>`,
      buttons: {}, render: html => html.find('.f-btn').click(ev => { dlg.close(); this._showFeatGroupPicker(ev.currentTarget.dataset.cat); })
    }).render(true);
  }

  async _showFeatGroupPicker(category) {
    const groupsMap = { 
      "Physical": ["Daredevil", "Gunslinger", "Defender"], 
      "Intellectual": ["Pragmatist", "Penitent", "Resilient"], 
      "Social": ["Ally", "Handler", "Operator"] 
    };
    const subgroups = groupsMap[category];
    const pack = game.packs.get("eerie.feats");
    if (!pack) return ui.notifications.error("Пак Feats не найден!");

    const index = await pack.getIndex({fields: ["system.group", "system.description"]});
    
    let groupsHtml = `<div style="max-height: 500px; overflow-y: auto;">`;
    for (const sub of subgroups) {
      groupsHtml += `<div style="background:#222;color:#fff;padding:4px;font-weight:bold;margin-top:10px;">${sub.toUpperCase()}</div>`;
      
      const filtered = index.filter(e => e.system.group === sub);
      
      filtered.forEach(i => {
        const name = game.i18n.localize(i.name);
        const desc = game.i18n.localize(i.system.description || "");

        groupsHtml += `
          <div class="opt" data-id="${i._id}" style="border:1px solid #999;padding:8px;margin:5px 0;cursor:pointer;background:#fff;color:#000;">
            <strong>${name}</strong><br>
            <small>${desc}</small>
          </div>`;
      });
    }
    groupsHtml += `</div>`;

    const dlg = new Dialog({
      title: `Feats: ${category}`, 
      content: groupsHtml, 
      buttons: {},
      render: html => {
        html.find('.opt').click(async ev => { 
          const selected = await pack.getDocument(ev.currentTarget.dataset.id); 
          await this.actor.createEmbeddedDocuments("Item", [selected.toObject()]); 
          dlg.close(); 
        });
      }
    }, { width: 450 }).render(true);
  }

  async _rollStat(stat, weaponOptions = null) {
    const val = this.actor.system[`${stat}Temp`] || 0;
    let mods = { ...this.actor.system.modifiers };
    let severityBonus = 0;
let customLabel = this.actor.system[`${stat}Label`];
let statName = customLabel ? customLabel.toUpperCase() : game.i18n.localize(`EERIE.${stat.charAt(0).toUpperCase() + stat.slice(1)}`).toUpperCase();

if(!customLabel && statName.includes("EERIE.")) statName = stat.toUpperCase(); 

let head = weaponOptions ? weaponOptions.weaponName.toUpperCase() : statName;

    if (weaponOptions) {
        mods.plusOne = true; mods.increased = true; mods.reduced = false;
        severityBonus = weaponOptions.severity || 0;
    }

    let n = 0, drop = 0;
    if (val === 0) {
      if (mods.plusOne) { n = 1; drop = 0; head += " (+1)"; }
      else if (mods.minusOne) { n = 3; drop = 2; head += " (-1)"; }
      else { n = 2; drop = 1; head += " (Zero)"; }
    } else {
      n = val;
      if (mods.plusOne) n = Math.min(val + 1, 3);
      else if (mods.minusOne) { n = val - 1; if (n === 0) { n = 2; drop = 1; head += " (Zero)"; } }
    }
    if (mods.disadvantage && n > 1) {
        if (n === 3 && drop === 1) drop = 2;
        else if (drop === 0) drop = 1;
    }

    const roll = await new Roll(`${n}d6${drop > 0 ? "dh" + drop : ""}`).evaluate();
    const active = roll.terms[0].results.filter(d => d.active).map(d => d.result);
    const best = active.length ? Math.max(...active) : 0;
    const sixes = active.filter(d => d === 6).length;

    let resT = "", resC = "", disp = best, resCl = "res-fail", dotCount = 0;

    if (sixes >= 2) { 
      resT = game.i18n.format("EERIE.ChatCritical"); 
      resC = "#006400";
      disp = "6&6"; resCl = "res-crit"; dotCount = 3;
      if (game.settings.get("eerie", "critRelief")) {
        let u = {}; if (this.actor.system.willTemp < this.actor.system.will) u["system.willTemp"] = this.actor.system.willTemp + 1;
        if (this.actor.system.mindTemp < this.actor.system.mind) u["system.mindTemp"] = this.actor.system.mindTemp + 1;
        if (Object.keys(u).length > 0) this.actor.update(u);
      }
    } else if (best === 6) { resT = game.i18n.format("EERIE.ChatSuccess"); resC = "#00008b"; resCl = "res-success"; dotCount = 2; }
    else if (best >= 4) { resT = game.i18n.format("EERIE.ChatPartial"); resC = "#8b4513"; resCl = "res-partial"; dotCount = 1; }
    else { resT = game.i18n.format("EERIE.ChatFail"); resC = "#8b0000"; resCl = "res-fail"; dotCount = 0; }

    if (resCl !== "res-fail") {
        if (mods.increased) dotCount += 1;
        if (mods.reduced) dotCount -= 1;
        dotCount += severityBonus;
    } else { dotCount = 0; }
    dotCount = Math.max(0, dotCount);

    let dotsHtml = '<div class="eff-dots-tray">';
    for (let i = 0; i < dotCount; i++) { dotsHtml += '<span class="eff-dot">●</span>'; }
    dotsHtml += '</div>';

    let effHT = mods.increased ? ", INCREASED" : (mods.reduced ? ", REDUCED" : "");
    let effSt = (resCl === "res-fail" && effHT !== "") ? 'style="opacity: 0.4; color: #666;"' : "";
    const dice = roll.terms[0].results.map(d => `<span class="die ${d.active ? '' : 'die-discarded'}">${d.result}</span>`).join("");
    
    const content = `
      <div class="eerie-roll-card">
        <div class="roll-header">${head} CHECK<span ${effSt}>${effHT}</span></div>
        <div class="roll-result-body ${resCl}">
          <div class="result-number">${disp}</div>
          <div class="result-text" style="color:${resC}">${resT}</div>
          ${dotsHtml}
        </div>
        <div class="roll-dice-tray">${dice}</div>
      </div>`;

    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  async _onCountResourceClick(ev) {
    const item = this.actor.items.get(ev.currentTarget.closest('.item-wrapper').dataset.itemId);
    let v = item.system.count.value;
    if (ev.button === 0) v = Math.min(v + 1, item.system.count.max); else v = Math.max(v - 1, 0);
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
    if (ev.button === 0) v = Math.min(v + 1, m); else v = Math.max(v - 1, 0);
    this.actor.update({ [`system.${k}`]: v });
  }

  _onItemEdit(ev) { const id = ev.currentTarget.closest('.item-wrapper, .condition-box')?.dataset.itemId; if (id) this.actor.items.get(id)?.sheet.render(true); }
  async _onItemDelete(ev) { ev.stopPropagation(); const id = ev.currentTarget.closest('.item-wrapper, .condition-box')?.dataset.itemId; if (id && await Dialog.confirm({ title: "Delete?", content: "Are you sure?" })) await this.actor.deleteEmbeddedDocuments("Item", [id]); }
  
  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    const existing = this.actor.items.filter(i => i.type === item.type).length;
    let max = (item.type === "trait" || item.type === "feat") ? 1 : ((item.type === "bodyCondition" || item.type === "mindCondition") ? 3 : 999);
    if (existing >= max) { ui.notifications.warn(game.i18n.format("EERIE.CondSlotsFull" , { type: item.type })); return false; }
    return super._onDropItem(event, data);
  }
  
	async _onGeneratorRoll(event) {
    event.preventDefault();

    const pack = game.packs.get("eerie.tables"); 
    if (!pack) return ui.notifications.error("Системный компендиум 'eerie.tables' не найден!");

    await pack.getIndex();
    const detailsEntry = pack.index.find(e => e.name === "Details");
    const solaceEntry = pack.index.find(e => e.name === "Solace");

    if (!detailsEntry || !solaceEntry) {
      return ui.notifications.error("В компендиуме не найдены таблицы 'Details' или 'Solace'!");
    }

    const detailsTable = await pack.getDocument(detailsEntry._id);
    const solaceTable = await pack.getDocument(solaceEntry._id);

    const drawDetails = await detailsTable.draw({ displayChat: false });
    const drawSolace = await solaceTable.draw({ displayChat: false });

    const resDetails = drawDetails.results[0];
    const resSolace = drawSolace.results[0];

	const cleanString = (str) => {
      return str
        .replace(/<[^>]*>/g, "") 
        .replace(/[\n\r\t]/g, "")
        .replace(/&nbsp;/g, " ") 
        .trim();                
    };

    const rawDetails = cleanString(resDetails.text || resDetails.name || "");
    const rawSolace = cleanString(resSolace.text || resSolace.name || "");
	
    const textDetails = game.i18n.localize(rawDetails);
    const textSolace = game.i18n.localize(rawSolace);

    const htmlDetails = await resDetails.getHTML();
    const htmlSolace = await resSolace.getHTML();

    console.log("Eerie | Generated Details:", textDetails);
    console.log("Eerie | Generated Solace:", textSolace);

    if (textDetails && textSolace) {
      await this.actor.update({
        "system.details": textDetails,
        "system.solace": textSolace
      });
      ui.notifications.info(game.i18n.format("EERIE.GeneratorSuccess", {name: this.actor.name}));
    } else {
      return ui.notifications.error("Ошибка: Таблицы вернули пустой результат.");
    }

    const shouldPostToChat = game.settings.get("eerie", "showPersonalityToChat");

    if (shouldPostToChat) {
      const chatContent = `
        <div class="eerie-roll-card">
          <div class="roll-header">CHARACTER GENERATOR</div>
          <div class="roll-result-body" style="background: rgba(0,0,0,0.05); border: 1px solid #000; padding: 10px;">
            <div style="font-weight: bold; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize("EERIE.Details")}</div>
            <div style="margin-bottom: 10px; font-style: italic; font-size: 14px;">${textDetails}</div>
            
            <div style="font-weight: bold; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">${game.i18n.localize("EERIE.Solace")}</div>
            <div style="font-size: 14px;">${textSolace}</div>
          </div>
        </div>
      `;

      ChatMessage.create({
        user: game.user._id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: chatContent
      });
      
      AudioHelper.play({ src: "sounds/dice.wav" }, true);
    }
  }
  
  async _onItemToChat(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.item-wrapper, .condition-box').dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const name = game.i18n.localize(item.name);
    const desc = game.i18n.localize(item.system.description);

    const chatContent = `
      <div class="eerie-roll-card">
        <div class="roll-header">${item.type.toUpperCase()} INFO</div>
        <div class="item-chat-body" style="text-align: left; padding: 10px; background: rgba(0,0,0,0.03); border: 1px solid #000;">
          <div style="font-weight: bold; font-size: 18px; font-family: 'TitleFont'; border-bottom: 1px solid #999; margin-bottom: 5px;">
            ${name}
          </div>
          <div style="font-size: 14px; line-height: 1.4; white-space: pre-wrap;">${desc}</div>
        </div>
      </div>
    `;

    ChatMessage.create({
      user: game.user._id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatContent
    });
  }
}