import BlockItem from "./blockly/BlockItem.js";
import BlockInstance from "./blockly/BlockInstance.js";
import Utils from "./blockly/Utils.js";

export default async function ({ addon, msg, console }) {
  const Blockly = await addon.tab.traps.getBlockly();

  class FindBar {
    constructor() {
      this.utils = new Utils(addon);

      this.prevValue = "";

      this.findBarOuter = null;
      this.findWrapper = null;
      this.findInput = null;
      this.dropdownOut = null;
      this.dropdown = new Dropdown(this.utils);

      document.addEventListener("keydown", (e) => this.eventKeyDown(e), true);
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom(root) {
      this.findBarOuter = document.createElement("div");
      this.findBarOuter.className = "sa-find-bar";
      addon.tab.displayNoneWhileDisabled(this.findBarOuter, { display: "flex" });
      root.appendChild(this.findBarOuter);

      this.findWrapper = this.findBarOuter.appendChild(document.createElement("span"));
      this.findWrapper.className = "sa-find-wrapper";

      this.dropdownOut = this.findWrapper.appendChild(document.createElement("label"));
      this.dropdownOut.className = "sa-find-dropdown-out";

      this.findInput = this.dropdownOut.appendChild(document.createElement("input"));
      this.findInput.className = addon.tab.scratchClass("input_input-form", {
        others: "sa-find-input",
      });
      // for <label>
      this.findInput.id = "sa-find-input";
      this.findInput.type = "search";
      this.findInput.placeholder = msg("find-placeholder");
      this.findInput.autocomplete = "off";

      this.dropdownOut.appendChild(this.dropdown.createDom());

      this.bindEvents();
      this.tabChanged();
    }

    bindEvents() {
      this.findInput.addEventListener("focus", () => this.inputChange());
      this.findInput.addEventListener("keydown", (e) => this.inputKeyDown(e));
      this.findInput.addEventListener("keyup", () => this.inputChange());
      this.findInput.addEventListener("focusout", () => this.hideDropDown());
    }

    tabChanged() {
      if (!this.findBarOuter) {
        return;
      }
      const tab = addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
      const visible = tab === 0 || tab === 1 || tab === 2;
      this.findBarOuter.hidden = !visible;
    }

    inputChange() {
      this.showDropDown();

      // Filter the list...
      let val = (this.findInput.value || "").toLowerCase();
      if (val === this.prevValue) {
        // No change so don't re-filter
        return;
      }
      this.prevValue = val;

      this.dropdown.blocks = null;

      // Hide items in list that do not contain filter text
      let listLI = this.dropdown.items;
      for (const li of listLI) {
        let procCode = li.data.procCode;
        let i = li.data.lower.indexOf(val);
        if (i >= 0) {
          li.style.display = "block";
          while (li.firstChild) {
            li.removeChild(li.firstChild);
          }
          if (i > 0) {
            li.appendChild(document.createTextNode(procCode.substring(0, i)));
          }
          let bText = document.createElement("b");
          bText.appendChild(document.createTextNode(procCode.substr(i, val.length)));
          li.appendChild(bText);
          if (i + val.length < procCode.length) {
            li.appendChild(document.createTextNode(procCode.substr(i + val.length)));
          }
        } else {
          li.style.display = "none";
        }
      }
    }

    inputKeyDown(e) {
      this.dropdown.inputKeyDown(e);

      // Enter
      if (e.key === "Enter") {
        this.findInput.blur();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        if (this.findInput.value.length > 0) {
          this.findInput.value = ""; // Clear search first, then close on second press
          this.inputChange();
        } else {
          this.findInput.blur();
        }
        e.preventDefault();
        return;
      }
    }

    eventKeyDown(e) {
      if (addon.self.disabled || !this.findBarOuter) return;

      let ctrlKey = e.ctrlKey || e.metaKey;

      if (e.key.toLowerCase() === "f" && ctrlKey && !e.shiftKey) {
        // Ctrl + F (Override default Ctrl+F find)
        this.findInput.focus();
        this.findInput.select();
        e.cancelBubble = true;
        e.preventDefault();
        return true;
      }

      if (e.key === "ArrowLeft" && ctrlKey) {
        // Ctrl + Left Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goBack();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }

      if (e.key === "ArrowRight" && ctrlKey) {
        // Ctrl + Right Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goForward();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }
    }

    showDropDown(focusID, instanceBlock) {
      if (!focusID && this.dropdownOut.classList.contains("visible")) {
        return;
      }

      // special '' vs null... - null forces a reevaluation
      this.prevValue = focusID ? "" : null; // Clear the previous value of the input search

      this.dropdownOut.classList.add("visible");
      let scratchBlocks =
        this.selectedTab === 0
          ? this.getScratchBlocks()
          : this.selectedTab === 1
            ? this.getScratchCostumes()
            : this.selectedTab === 2
              ? this.getScratchSounds()
              : [];

      this.dropdown.empty();

      for (const proc of scratchBlocks) {
        let item = this.dropdown.addItem(proc);

        if (focusID) {
          if (proc.matchesID(focusID)) {
            this.dropdown.onItemClick(item, instanceBlock);
          } else {
            item.style.display = "none";
          }
        }
      }

      this.utils.offsetX = this.dropdownOut.getBoundingClientRect().width + 32;
      this.utils.offsetY = 32;
    }

    hideDropDown() {
      this.dropdownOut.classList.remove("visible");
    }

    get selectedTab() {
      return addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
    }

    getScratchBlocks() {
      let myBlocks = [];
      let myBlocksByProcCode = {};
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;

      /**
       * 生成积木的显示文本
       * @param {object} block - 积木数据
       * @param {object} target - 目标对象
       * @returns {string} 积木的显示文本
       */
      function generateBlockText(block, target) {
        if (!block || !block.opcode) return "";

        const opcode = block.opcode;
        const fields = block.fields || {};
        const inputs = block.inputs || {};

        // Helper function to get variable name by ID
        const getVariableName = (varId, target) => {
          if (!varId || !target) return varId;
          const variable = target.variables[varId];
          return variable ? variable.name : varId;
        };

        // Helper function to get list name by ID
        const getListName = (listId, target) => {
          if (!listId || !target) return listId;
          const variable = target.variables[listId];
          return variable ? variable.name : listId;
        };

        // Helper function to get input value content
        const getInputValue = (input, target, blocks) => {
          if (!input || !target) return "( )";
          if (!blocks && target.blocks && target.blocks._blocks) {
            blocks = target.blocks._blocks;
          }
          if (!blocks) return "( )";

          // If it's a shadow block with a field value
          if (input.shadow) {
            const shadowBlockId = typeof input.shadow === 'string' ? input.shadow : input.shadow.id;
            if (shadowBlockId && blocks[shadowBlockId]) {
              const shadowBlock = blocks[shadowBlockId];
              if (shadowBlock) {
                // Handle text input
                if (shadowBlock.fields && shadowBlock.fields.TEXT) {
                  return `"${shadowBlock.fields.TEXT.value}"`;
                }
                // Handle math number
                if (shadowBlock.fields && shadowBlock.fields.NUM) {
                  return shadowBlock.fields.NUM.value;
                }
                // Handle other field types
                for (const fieldName of Object.keys(shadowBlock.fields || {})) {
                  return shadowBlock.fields[fieldName].value;
                }
              }
            }
          }

          // If it's a regular block
          if (input.block) {
            const blockId = typeof input.block === 'string' ? input.block : input.block.id;
            const inputBlock = blocks[blockId];
            if (inputBlock) {
              // Handle text blocks
              if (inputBlock.opcode === "text") {
                return `"${inputBlock.fields.TEXT.value}"`;
              }
              // Handle number blocks
              if (inputBlock.opcode === "math_number") {
                return inputBlock.fields.NUM.value;
              }
              // Handle variable reporters
              if (inputBlock.opcode === "data_variable") {
                const varId = inputBlock.fields.VARIABLE.value;
                return getVariableName(varId, target);
              }
              // Handle list reporters
              if (inputBlock.opcode === "data_listcontents") {
                const listId = inputBlock.fields.LIST.value;
                return getListName(listId, target);
              }
              // Handle color picker
              if (inputBlock.opcode === "colour_picker") {
                return inputBlock.fields.COLOUR.value;
              }
              // Handle boolean operators - return the structure
              if (inputBlock.opcode.startsWith("operator_")) {
                return generateBlockText(inputBlock, target);
              }
              // For other complex blocks, return a simplified representation
              return `[${inputBlock.opcode.replace(/_/g, ' ')}]`;
            }
          }

          return "( )";
        };
        
        // 处理事件类积木
        if (opcode === "event_whenflagclicked") {
          return "when flag clicked";
        }
        if (opcode === "event_whenthisspriteclicked") {
          return "when this sprite clicked";
        }
        if (opcode === "event_whenstageclicked") {
          return "when stage clicked";
        }
        if (opcode === "event_whenkeypressed") {
          const key = fields.KEY_OPTION?.value || "any";
          return `when key [${key}] pressed`;
        }
        if (opcode === "event_whenbroadcastreceived") {
          const message = fields.BROADCAST_OPTION?.value || "message1";
          return `when I receive [${message}]`;
        }
        if (opcode === "event_whenbackdropswitchesto") {
          const backdrop = fields.BACKDROP?.value || "backdrop1";
          return `when backdrop switches to [${backdrop}]`;
        }
        if (opcode === "event_whengreaterthan") {
          const option = fields.WHENGREATERTHANMENU?.value || "loudness";
          const value = getInputValue(inputs.VALUE, target, target.blocks._blocks);
          return `when [${option}] > ${value}`;
        }
        if (opcode === "event_whenbroadcastreceived") {
          const message = fields.BROADCAST_OPTION?.value || "message1";
          return `when I receive [${message}]`;
        }
        if (opcode === "control_start_as_clone") {
          return "when I start as a clone";
        }
        
        // 处理控制类积木
        if (opcode === "control_wait") {
          const secs = getInputValue(inputs.DURATION, target, target.blocks._blocks);
          return `wait ${secs} seconds`;
        }
        if (opcode === "control_repeat") {
          const times = getInputValue(inputs.TIMES, target, target.blocks._blocks);
          return `repeat ${times}`;
        }
        if (opcode === "control_if") {
          return "if <> then";
        }
        if (opcode === "control_if_else") {
          return "if <> then else";
        }
        if (opcode === "control_wait_until") {
          return "wait until <>";
        }
        if (opcode === "control_repeat_until") {
          return "repeat until <>";
        }
        if (opcode === "control_stop") {
          const option = fields.STOP_OPTION?.value || "all";
          return `stop [${option}]`;
        }
        if (opcode === "control_create_clone_of") {
          const option = getInputValue(inputs.CLONE_OPTION, target, target.blocks._blocks);
          return `create clone of ${option}`;
        }
        if (opcode === "control_delete_this_clone") {
          return "delete this clone";
        }
        
        // 处理变量和列表
        if (opcode === "data_setvariableto") {
          const varId = fields.VARIABLE?.value || "";
          const varName = getVariableName(varId, target);
          const value = getInputValue(inputs.VALUE, target, target.blocks._blocks);
          return `set [${varName}] to ${value}`;
        }
        if (opcode === "data_changevariableby") {
          const varId = fields.VARIABLE?.value || "";
          const varName = getVariableName(varId, target);
          const value = getInputValue(inputs.VALUE, target, target.blocks._blocks);
          return `change [${varName}] by ${value}`;
        }
        if (opcode === "data_showvariable") {
          const varId = fields.VARIABLE?.value || "";
          const varName = getVariableName(varId, target);
          return `show variable [${varName}]`;
        }
        if (opcode === "data_hidevariable") {
          const varId = fields.VARIABLE?.value || "";
          const varName = getVariableName(varId, target);
          return `hide variable [${varName}]`;
        }
        if (opcode === "data_addtolist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const item = getInputValue(inputs.ITEM, target, target.blocks._blocks);
          return `add ${item} to [${listName}]`;
        }
        if (opcode === "data_deleteoflist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const index = getInputValue(inputs.INDEX, target, target.blocks._blocks);
          return `delete ${index} of [${listName}]`;
        }
        if (opcode === "data_deletealloflist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          return `delete all of [${listName}]`;
        }
        if (opcode === "data_insertatlist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const item = getInputValue(inputs.ITEM, target, target.blocks._blocks);
          const index = getInputValue(inputs.INDEX, target, target.blocks._blocks);
          return `insert ${item} at ${index} of [${listName}]`;
        }
        if (opcode === "data_replaceitemoflist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const index = getInputValue(inputs.INDEX, target, target.blocks._blocks);
          const item = getInputValue(inputs.ITEM, target, target.blocks._blocks);
          return `replace item ${index} of [${listName}] with ${item}`;
        }
        if (opcode === "data_itemoflist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const index = getInputValue(inputs.INDEX, target, target.blocks._blocks);
          return `item ${index} of [${listName}]`;
        }
        if (opcode === "data_itemnumoflist") {
          const item = getInputValue(inputs.ITEM, target, target.blocks._blocks);
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          return `item # of ${item} in [${listName}]`;
        }
        if (opcode === "data_lengthoflist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          return `length of [${listName}]`;
        }
        if (opcode === "data_listcontainsitem") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          const item = getInputValue(inputs.ITEM, target, target.blocks._blocks);
          return `[${listName}] contains ${item}?`;
        }
        if (opcode === "data_showlist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          return `show list [${listName}]`;
        }
        if (opcode === "data_hidelist") {
          const listId = fields.LIST?.value || "";
          const listName = getListName(listId, target);
          return `hide list [${listName}]`;
        }
        
        // 处理运算类积木
        if (opcode === "operator_add") {
          const num1 = getInputValue(inputs.NUM1, target, target.blocks._blocks);
          const num2 = getInputValue(inputs.NUM2, target, target.blocks._blocks);
          return `(${num1} + ${num2})`;
        }
        if (opcode === "operator_subtract") {
          const num1 = getInputValue(inputs.NUM1, target, target.blocks._blocks);
          const num2 = getInputValue(inputs.NUM2, target, target.blocks._blocks);
          return `(${num1} - ${num2})`;
        }
        if (opcode === "operator_multiply") {
          const num1 = getInputValue(inputs.NUM1, target, target.blocks._blocks);
          const num2 = getInputValue(inputs.NUM2, target, target.blocks._blocks);
          return `(${num1} * ${num2})`;
        }
        if (opcode === "operator_divide") {
          const num1 = getInputValue(inputs.NUM1, target, target.blocks._blocks);
          const num2 = getInputValue(inputs.NUM2, target, target.blocks._blocks);
          return `(${num1} / ${num2})`;
        }
        if (opcode === "operator_random") {
          const from = getInputValue(inputs.FROM, target, target.blocks._blocks);
          const to = getInputValue(inputs.TO, target, target.blocks._blocks);
          return `pick random ${from} to ${to}`;
        }
        if (opcode === "operator_lt") {
          const value1 = getInputValue(inputs.OPERAND1, target, target.blocks._blocks);
          const value2 = getInputValue(inputs.OPERAND2, target, target.blocks._blocks);
          return `<${value1} < ${value2}>`;
        }
        if (opcode === "operator_equals") {
          const value1 = getInputValue(inputs.OPERAND1, target, target.blocks._blocks);
          const value2 = getInputValue(inputs.OPERAND2, target, target.blocks._blocks);
          return `<${value1} = ${value2}>`;
        }
        if (opcode === "operator_gt") {
          const value1 = getInputValue(inputs.OPERAND1, target, target.blocks._blocks);
          const value2 = getInputValue(inputs.OPERAND2, target, target.blocks._blocks);
          return `<${value1} > ${value2}>`;
        }
        if (opcode === "operator_and") {
          const value1 = getInputValue(inputs.OPERAND1, target, target.blocks._blocks);
          const value2 = getInputValue(inputs.OPERAND2, target, target.blocks._blocks);
          return `<${value1} and ${value2}>`;
        }
        if (opcode === "operator_or") {
          const value1 = getInputValue(inputs.OPERAND1, target, target.blocks._blocks);
          const value2 = getInputValue(inputs.OPERAND2, target, target.blocks._blocks);
          return `<${value1} or ${value2}>`;
        }
        if (opcode === "operator_not") {
          const value = getInputValue(inputs.OPERAND, target, target.blocks._blocks);
          return `<not ${value}>`;
        }
        if (opcode === "operator_join") {
          const string1 = getInputValue(inputs.STRING1, target, target.blocks._blocks);
          const string2 = getInputValue(inputs.STRING2, target, target.blocks._blocks);
          return `join ${string1} and ${string2}`;
        }
        if (opcode === "operator_letter_of") {
          const letter = getInputValue(inputs.LETTER, target, target.blocks._blocks);
          const string = getInputValue(inputs.STRING, target, target.blocks._blocks);
          return `letter ${letter} of ${string}`;
        }
        if (opcode === "operator_length") {
          const string = getInputValue(inputs.STRING, target, target.blocks._blocks);
          return `length of ${string}`;
        }
        if (opcode === "operator_contains") {
          const string1 = getInputValue(inputs.STRING1, target, target.blocks._blocks);
          const string2 = getInputValue(inputs.STRING2, target, target.blocks._blocks);
          return `<${string1} contains ${string2}?>`;
        }
        if (opcode === "operator_mod") {
          const num1 = getInputValue(inputs.NUM1, target, target.blocks._blocks);
          const num2 = getInputValue(inputs.NUM2, target, target.blocks._blocks);
          return `(${num1} mod ${num2})`;
        }
        if (opcode === "operator_round") {
          const num = getInputValue(inputs.NUM, target, target.blocks._blocks);
          return `round ${num}`;
        }
        if (opcode === "operator_mathop") {
          const operator = fields.OPERATOR?.value || "abs";
          const num = getInputValue(inputs.NUM, target, target.blocks._blocks);
          return `[${operator}] of ${num}`;
        }
        
        // 处理自定义过程调用
        if (opcode === "procedures_call") {
          const procCode = block.mutation?.proccode || "custom block";
          // 处理参数
          let result = procCode;
          const paramNames = block.mutation?.argumentnames || "[]";
          const argNames = JSON.parse(paramNames);

          for (let i = 0; i < argNames.length; i++) {
            const argId = `input${i}`;
            const placeholder = `%${i + 1}s`;
            const value = getInputValue(inputs[argId], target, target.blocks._blocks);
            result = result.replace(placeholder, value);
          }
          return result;
        }
        
        // 处理感知类积木
        if (opcode === "sensing_touchingobject") {
          const object = getInputValue(inputs.TOUCHINGOBJECTMENU, target, target.blocks._blocks);
          return `<touching ${object}?>`;
        }
        if (opcode === "sensing_touchingcolor") {
          const color = getInputValue(inputs.COLOR, target, target.blocks._blocks);
          return `<touching color ${color}?>`;
        }
        if (opcode === "sensing_coloristouchingcolor") {
          const color1 = getInputValue(inputs.COLOR, target, target.blocks._blocks);
          const color2 = getInputValue(inputs.COLOR2, target, target.blocks._blocks);
          return `<color ${color1} is touching ${color2}?>`;
        }
        if (opcode === "sensing_distanceto") {
          const object = getInputValue(inputs.DISTANCETOMENU, target, target.blocks._blocks);
          return `distance to ${object}`;
        }
        if (opcode === "sensing_keypressed") {
          const key = getInputValue(inputs.KEY_OPTION, target, target.blocks._blocks);
          return `<key [${key}] pressed?>`;
        }
        if (opcode === "sensing_mousedown") {
          return "<mouse down?>";
        }
        if (opcode === "sensing_mousex") {
          return "mouse x";
        }
        if (opcode === "sensing_mousey") {
          return "mouse y";
        }
        if (opcode === "sensing_timer") {
          return "timer";
        }
        if (opcode === "sensing_resettimer") {
          return "reset timer";
        }
        if (opcode === "sensing_of") {
          const property = fields.PROPERTY?.value || "x position";
          const object = getInputValue(inputs.OBJECT, target, target.blocks._blocks);
          return `[${property}] of ${object}`;
        }
        if (opcode === "sensing_current") {
          const option = fields.CURRENTMENU?.value || "year";
          return `current [${option}]`;
        }
        if (opcode === "sensing_dayssince2000") {
          return "days since 2000";
        }
        if (opcode === "sensing_username") {
          return "username";
        }
        if (opcode === "sensing_loudness") {
          return "loudness";
        }
        
        // 默认返回opcode
        return opcode.replace(/_/g, ' ');
      }

      /**
       * @param cls
       * @param block
       * @param targetId
       * @param targetName
       * @returns BlockItem
       */
      function addBlock(cls, block, targetId, targetName, target) {
        let id = block.id;
        const blockText = generateBlockText(block, target);
        const displayName = targetName ? `[${targetName}] ${blockText}` : blockText;
        
        let clone = myBlocksByProcCode[displayName];
        if (clone) {
          if (!clone.clones) {
            clone.clones = [];
          }
          clone.clones.push(id);
          return clone;
        }
        let items = new BlockItem(cls, displayName, id, 0, targetId, targetName);
        myBlocks.push(items);
        myBlocksByProcCode[displayName] = items;
        return items;
      }

      // 遍历所有目标（精灵和舞台）
      for (const target of targets) {
        if (!target.isOriginal) continue; // 跳过克隆体
        
        const targetName = target.isStage ? "Stage" : target.sprite.name;
        const targetId = target.id;
        
        // 获取目标的积木
        const blocks = target.blocks._blocks;
        const blockIds = Object.keys(blocks);
        
        for (const blockId of blockIds) {
          const block = blocks[blockId];
          const blockType = block.opcode;
          
          if (blockType === "procedures_definition") {
            addBlock("define", block, targetId, targetName, target);
            continue;
          }

          if (blockType.startsWith("event_")) {
            addBlock("event", block, targetId, targetName, target);
            continue;
          }

          if (blockType === "control_start_as_clone") {
            addBlock("event", block, targetId, targetName, target);
            continue;
          }
          
          // 其他类型的积木也添加到搜索结果中
          if (blockType && !blockType.startsWith("procedures_")) {
            // 根据积木类型分类
            let cls = "stack";
            if (blockType.startsWith("data_")) {
              cls = blockType.includes("list") ? "list" : "var";
            } else if (blockType.startsWith("control_")) {
              cls = "control";
            } else if (blockType.startsWith("operator_")) {
              cls = "operator";
            } else if (blockType.startsWith("sensing_")) {
              cls = "sensing";
            } else if (blockType.startsWith("looks_")) {
              cls = "looks";
            } else if (blockType.startsWith("motion_")) {
              cls = "motion";
            } else if (blockType.startsWith("sound_")) {
              cls = "sound";
            } else if (blockType.startsWith("pen_")) {
              cls = "pen";
            }

            addBlock(cls, block, targetId, targetName, target);
          }
        }
      }
      return myBlocks;
    }

    getScratchCostumes() {
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;
      let items = [];
      let i = 0;

      // 遍历所有目标
      for (const target of targets) {
        if (!target.isOriginal) continue;
        
        const targetName = target.isStage ? "Stage" : target.sprite.name;
        const targetId = target.id;
        const costumes = target.getCostumes();
        
        for (const costume of costumes) {
          const displayName = target.isStage ? costume.name : `[${targetName}] ${costume.name}`;
          let item = new BlockItem("costume", displayName, costume.assetId, i, targetId, targetName);
          items.push(item);
          i++;
        }
      }

      return items;
    }

    getScratchSounds() {
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;
      let items = [];
      let i = 0;

      // 遍历所有目标
      for (const target of targets) {
        if (!target.isOriginal) continue;
        
        const targetName = target.isStage ? "Stage" : target.sprite.name;
        const targetId = target.id;
        const sounds = target.getSounds();
        
        for (const sound of sounds) {
          const displayName = target.isStage ? sound.name : `[${targetName}] ${sound.name}`;
          let item = new BlockItem("sound_", displayName, sound.assetId, i, targetId, targetName);
          items.push(item);
          i++;
        }
      }

      return items;
    }

    getCallsToEvents() {
      const uses = [];
      const alreadyFound = new Set();
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;

      // 遍历所有目标
      for (const target of targets) {
        if (!target.isOriginal) continue;
        
        const targetId = target.id;
        const blocks = target.blocks._blocks;
        
        for (const blockId of Object.keys(blocks)) {
          const block = blocks[blockId];
          
          if (block.opcode !== "event_broadcast" && block.opcode !== "event_broadcastandwait") {
            continue;
          }

          let eventName = "";
          const broadcastInputBlockId = block.inputs.BROADCAST_INPUT?.block;
          if (broadcastInputBlockId) {
            const broadcastInputBlock = blocks[broadcastInputBlockId];
            if (broadcastInputBlock && broadcastInputBlock.opcode === "event_broadcast_menu") {
              eventName = broadcastInputBlock.fields.BROADCAST_OPTION?.value || "";
            } else {
              eventName = msg("complex-broadcast");
            }
          }
          
          if (eventName && !alreadyFound.has(eventName)) {
            alreadyFound.add(eventName);
            uses.push({ eventName: eventName, block: {id: blockId}, targetId: targetId });
          }
        }
      }

      return uses;
    }
  }

  class Dropdown {
    constructor(utils) {
      this.utils = utils;

      this.el = null;
      this.items = [];
      this.selected = null;
      this.carousel = new Carousel(this.utils);
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom() {
      this.el = document.createElement("ul");
      this.el.className = "sa-find-dropdown";
      return this.el;
    }

    inputKeyDown(e) {
      // Up Arrow
      if (e.key === "ArrowUp") {
        this.navigateFilter(-1);
        e.preventDefault();
        return;
      }

      // Down Arrow
      if (e.key === "ArrowDown") {
        this.navigateFilter(1);
        e.preventDefault();
        return;
      }

      // Enter
      if (e.key === "Enter") {
        // Any selected on enter? if not select now
        if (this.selected) {
          this.navigateFilter(1);
        }
        e.preventDefault();
        return;
      }

      this.carousel.inputKeyDown(e);
    }

    navigateFilter(dir) {
      let nxt;
      if (this.selected && this.selected.style.display !== "none") {
        nxt = dir === -1 ? this.selected.previousSibling : this.selected.nextSibling;
      } else {
        nxt = this.items[0];
        dir = 1;
      }
      while (nxt && nxt.style.display === "none") {
        nxt = dir === -1 ? nxt.previousSibling : nxt.nextSibling;
      }
      if (nxt) {
        nxt.scrollIntoView({ block: "nearest" });
        this.onItemClick(nxt);
      }
    }

    addItem(proc) {
      const item = document.createElement("li");
      item.innerText = proc.procCode;
      item.data = proc;
      item.title = proc.procCode; // 添加title属性，鼠标悬浮时显示完整文本
      
      const colorIds = {
        receive: "events",
        event: "events",
        define: "more",
        var: "data",
        VAR: "data",
        list: "data-lists",
        LIST: "data-lists",
        costume: "looks",
        sound: "sounds",
        stack: "control",
        control: "control",
        operator: "operators",
        sensing: "sensing",
        looks: "looks",
        motion: "motion",
        sound_: "sounds",
        pen: "pen",
      };
      if (proc.cls === "flag") {
        item.className = "sa-find-flag";
      } else {
        const colorId = colorIds[proc.cls];
        item.className = `sa-block-color sa-block-color-${colorId}`;
      }
      item.addEventListener("mousedown", (e) => {
        this.onItemClick(item);
        e.preventDefault();
        e.cancelBubble = true;
        return false;
      });
      this.items.push(item);
      this.el.appendChild(item);
      return item;
    }

    onItemClick(item, instanceBlock) {
        if (this.selected && this.selected !== item) {
          this.selected.classList.remove("sel");
          this.selected = null;
        }
        if (this.selected !== item) {
          item.classList.add("sel");
          this.selected = item;
        }

        // 切换到目标（如果需要）
        if (item.data.targetId && item.data.targetId !== this.utils.getEditingTarget().id) {
          this.utils.setEditingTarget(item.data.targetId);
          // 等待目标切换完成
          setTimeout(() => this.onItemClickAfterTargetSwitch(item, instanceBlock), 100);
          return;
        }
        
        this.onItemClickAfterTargetSwitch(item, instanceBlock);
      }

      onItemClickAfterTargetSwitch(item, instanceBlock) {
        let cls = item.data.cls;
        if (cls === "costume" || cls === "sound_") {
          // Viewing costumes/sounds - jump to selected costume/sound
          const assetPanel = document.querySelector("[class^=asset-panel_wrapper]");
          if (assetPanel) {
            const reactInstance = assetPanel[addon.tab.traps.getInternalKey(assetPanel)];
            const reactProps = reactInstance.child.stateNode.props;
            reactProps.onItemClick(item.data.y);
            const selectorList = assetPanel.firstChild.firstChild;
            if (selectorList.children[item.data.y]) {
              selectorList.children[item.data.y].scrollIntoView({
                behavior: "auto",
                block: "center",
                inline: "start",
              });
            }
            // The wrapper seems to scroll when we use the function above.
            let wrapper = assetPanel.closest("div[class*=gui_flex-wrapper]");
            if (wrapper) wrapper.scrollTop = 0;
          }
        } else if (cls === "define") {
          let blocks = this.getCallsToProcedureById(item.data.labelID);
          this.carousel.build(item, blocks, instanceBlock);
        } else if (cls === "receive") {
          // Now, fetch the events from the scratch runtime instead of blockly
          let blocks = this.getCallsToEventsByName(item.data.eventName);
          if (!instanceBlock) {
            // Can we start by selecting the first block on 'this' sprite
            const currentTargetID = this.utils.getEditingTarget().id;
            for (const block of blocks) {
              if (block.targetId === currentTargetID) {
                instanceBlock = block;
                break;
              }
            }
          }
          this.carousel.build(item, blocks, instanceBlock);
        } else if (item.data.clones) {
          let blocks = [this.workspace.getBlockById(item.data.labelID)];
          for (const cloneID of item.data.clones) {
            blocks.push(this.workspace.getBlockById(cloneID));
          }
          this.carousel.build(item, blocks, instanceBlock);
        } else {
          this.utils.scrollBlockIntoView(item.data.labelID);
          this.carousel.remove();
        }
      }

    getVariableUsesById(id) {
      let uses = [];
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;

      // 遍历所有目标
      for (const target of targets) {
        if (!target.isOriginal) continue;

        const blocks = target.blocks._blocks;

        for (const blockId of Object.keys(blocks)) {
          const block = blocks[blockId];

          // 检查积木是否使用了该变量
          if (block.fields) {
            for (const fieldName of Object.keys(block.fields)) {
              const field = block.fields[fieldName];
              if (field.value === id) {
                uses.push(new BlockInstance(target, block));
                break;
              }
            }
          }

          // 检查输入中是否使用了该变量
          if (block.inputs) {
            for (const inputName of Object.keys(block.inputs)) {
              const input = block.inputs[inputName];
              const blockId = typeof input.block === 'string' ? input.block : input.block.id;
              if (blockId && blocks[blockId]) {
                const inputBlock = blocks[blockId];
                if (inputBlock && inputBlock.fields) {
                  for (const fieldName of Object.keys(inputBlock.fields)) {
                    const field = inputBlock.fields[fieldName];
                    if (field.value === id) {
                      uses.push(new BlockInstance(target, block));
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }

      return uses;
    }

    getCallsToProcedureById(id) {
      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets;
      let procCode = null;
      let targetId = null;
      
      // 首先找到该过程的定义以获取 procCode
      for (const target of targets) {
        if (!target.isOriginal) continue;
        
        const blocks = target.blocks._blocks;
        if (blocks[id] && blocks[id].opcode === "procedures_definition") {
          const definitionBlock = blocks[id];
          const protopypeBlockId = definitionBlock.inputs.custom_block?.block;
          if (protopypeBlockId) {
            const protopypeBlock = blocks[protopypeBlockId];
            procCode = protopypeBlock.mutation?.proccode;
            targetId = target.id;
            break;
          }
        }
      }
      
      if (!procCode || !targetId) {
        return [];
      }

      let uses = [new BlockInstance(targets.find(t => t.id === targetId), {id: id})]; // Definition First, then calls to it
      
      // 遍历所有目标查找调用
      for (const target of targets) {
        if (!target.isOriginal) continue;
        
        const blocks = target.blocks._blocks;
        
        for (const blockId of Object.keys(blocks)) {
          const block = blocks[blockId];
          if (block.opcode === "procedures_call") {
            if (block.mutation?.proccode === procCode) {
              uses.push(new BlockInstance(target, block));
            }
          }
        }
      }

      return uses;
    }

    getCallsToEventsByName(name) {
      let uses = []; // Definition First, then calls to it

      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets; // The sprites / stage

      // 首先找到所有接收该广播的事件定义
      for (const target of targets) {
        if (!target.isOriginal) {
          continue; // Skip clones
        }

        const blocks = target.blocks._blocks;
        if (!blocks) {
          continue;
        }

        for (const id of Object.keys(blocks)) {
          const block = blocks[id];
          if (block.opcode === "event_whenbroadcastreceived" && 
              block.fields.BROADCAST_OPTION && 
              block.fields.BROADCAST_OPTION.value === name) {
            uses.push(new BlockInstance(target, block));
          }
        }
      }

      // 然后找到所有发送该广播的积木
      for (const target of targets) {
        if (!target.isOriginal) {
          continue; // Skip clones
        }

        const blocks = target.blocks._blocks;
        if (!blocks) {
          continue;
        }

        for (const id of Object.keys(blocks)) {
          const block = blocks[id];
          if (block.opcode === "event_broadcast" || block.opcode === "event_broadcastandwait") {
            const broadcastInputBlockId = block.inputs.BROADCAST_INPUT?.block;
            if (broadcastInputBlockId) {
              const broadcastInputBlock = blocks[broadcastInputBlockId];
              if (broadcastInputBlock) {
                let eventName;
                if (broadcastInputBlock.opcode === "event_broadcast_menu") {
                  eventName = broadcastInputBlock.fields.BROADCAST_OPTION?.value;
                } else {
                  eventName = msg("complex-broadcast");
                }
                if (eventName === name) {
                  uses.push(new BlockInstance(target, block));
                }
              }
            }
          }
        }
      }

      return uses;
    }

    empty() {
      for (const item of this.items) {
        if (this.el.contains(item)) {
          this.el.removeChild(item);
        }
      }
      this.items = [];
      this.selected = null;
    }
  }

  class Carousel {
    constructor(utils) {
      this.utils = utils;

      this.el = null;
      this.count = null;
      this.blocks = [];
      this.idx = 0;
    }

    build(item, blocks, instanceBlock) {
      if (this.el && this.el.parentNode === item) {
        // Same control... click again to go to next
        this.navRight();
      } else {
        this.remove();
        this.blocks = blocks;
        item.appendChild(this.createDom());

        this.idx = 0;
        if (instanceBlock) {
          for (const idx of Object.keys(this.blocks)) {
            const block = this.blocks[idx];
            if (block.id === instanceBlock.id) {
              this.idx = Number(idx);
              break;
            }
          }
        }

        if (this.idx < this.blocks.length) {
          this.utils.scrollBlockIntoView(this.blocks[this.idx]);
        }
      }
    }

    createDom() {
      this.el = document.createElement("span");
      this.el.className = "sa-find-carousel";

      const leftControl = this.el.appendChild(document.createElement("span"));
      leftControl.className = "sa-find-carousel-control";
      leftControl.textContent = "◀";
      leftControl.addEventListener("mousedown", (e) => this.navLeft(e));

      this.count = this.el.appendChild(document.createElement("span"));
      this.count.innerText = this.blocks.length > 0 ? this.idx + 1 + " / " + this.blocks.length : "0";

      const rightControl = this.el.appendChild(document.createElement("span"));
      rightControl.className = "sa-find-carousel-control";
      rightControl.textContent = "▶";
      rightControl.addEventListener("mousedown", (e) => this.navRight(e));

      return this.el;
    }

    inputKeyDown(e) {
      // Left Arrow
      if (e.key === "ArrowLeft") {
        if (this.el && this.blocks) {
          this.navLeft(e);
        }
      }

      // Right Arrow
      if (e.key === "ArrowRight") {
        if (this.el && this.blocks) {
          this.navRight(e);
        }
      }
    }

    navLeft(e) {
      return this.navSideways(e, -1);
    }

    navRight(e) {
      return this.navSideways(e, 1);
    }

    navSideways(e, dir) {
      if (this.blocks.length > 0) {
        this.idx = (this.idx + dir + this.blocks.length) % this.blocks.length; // + length to fix negative modulo js issue.
        this.count.innerText = this.idx + 1 + " / " + this.blocks.length;
        this.utils.scrollBlockIntoView(this.blocks[this.idx]);
      }

      if (e) {
        e.cancelBubble = true;
        e.preventDefault();
      }
    }

    remove() {
      if (this.el) {
        this.el.remove();
        this.blocks = [];
        this.idx = 0;
      }
    }
  }

  const findBar = new FindBar();

  const _doBlockClick_ = Blockly.Gesture.prototype.doBlockClick_;
  Blockly.Gesture.prototype.doBlockClick_ = function () {
    if (!addon.self.disabled && (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey)) {
      // Wheel button...
      // Intercept clicks to allow jump to...?
      let block = this.startBlock_;
      for (; block; block = block.getSurroundParent()) {
        if (block.type === "procedures_definition" || (!this.jumpToDef && block.type === "procedures_call")) {
          let id = block.id ? block.id : block.getId ? block.getId() : null;

          findBar.findInput.focus();
          findBar.showDropDown(id);

          return;
        }

        if (
          block.type === "data_variable" ||
          block.type === "data_changevariableby" ||
          block.type === "data_setvariableto"
        ) {
          let id = block.getVars()[0];

          findBar.findInput.focus();
          findBar.showDropDown(id, block);

          findBar.selVarID = id;

          return;
        }

        if (
          block.type === "event_whenbroadcastreceived" ||
          block.type === "event_broadcastandwait" ||
          block.type === "event_broadcast"
        ) {
          // todo: actually index the broadcasts...!
          let id = block.id;

          findBar.findInput.focus();
          findBar.showDropDown(id, block);

          findBar.selVarID = id;

          return;
        }
      }
    }

    _doBlockClick_.call(this);
  };

  addon.tab.redux.initialize();
  addon.tab.redux.addEventListener("statechanged", (e) => {
    if (e.detail.action.type === "scratch-gui/navigation/ACTIVATE_TAB") {
      findBar.tabChanged();
    }
  });

  while (true) {
    const root = await addon.tab.waitForElement("ul[class*=gui_tab-list_]", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });
    findBar.createDom(root);
  }
}
