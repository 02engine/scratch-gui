export default async function createVariablesTab({ debug, addon, msg }) {
  const vm = addon.tab.traps.vm;
  
  // 存储所有变量包装器
  let localVariables = [];
  let globalVariables = [];
  
  // 创建 Tab
  const tab = debug.createHeaderTab({
    text: msg("tab-variables"),
    icon: addon.self.getResource("/icons/variable.svg"),
  });

  // 创建内容容器
  const content = document.createElement("div");
  content.className = "sa-debugger-variables";
  
  // 创建搜索和按钮区域
  const headerRow = document.createElement("div");
  headerRow.className = "sa-debugger-variables-header";
  
  // 创建搜索框
  const searchBox = document.createElement("input");
  searchBox.type = "text";
  searchBox.className = "sa-debugger-variables-search";
  searchBox.placeholder = msg("search-variables");
  headerRow.appendChild(searchBox);
  
  // 创建"全部取消"按钮
  const uncheckAllBtn = document.createElement("button");
  uncheckAllBtn.className = "sa-debugger-variables-uncheck-all";
  uncheckAllBtn.textContent = msg("uncheck-all");
  uncheckAllBtn.addEventListener("click", () => {
    [...localVariables, ...globalVariables].forEach(v => {
      v.checked = false;
      // 更新复选框状态
      const checkbox = v.row.querySelector(".sa-debugger-variable-checkbox");
      if (checkbox) checkbox.checked = false;
      v.updateDisplayMode();
    });
    reorderVariables();
  });
  headerRow.appendChild(uncheckAllBtn);
  
  content.appendChild(headerRow);

  // 创建"此角色"变量区域
  const localSection = document.createElement("div");
  localSection.className = "sa-debugger-variables-section";
  const localHeading = document.createElement("h3");
  localHeading.textContent = msg("for-this-sprite");
  localHeading.className = "sa-debugger-variables-heading";
  const localList = document.createElement("div");
  localList.className = "sa-debugger-variables-list";
  localSection.appendChild(localHeading);
  localSection.appendChild(localList);
  content.appendChild(localSection);

  // 创建"所有角色"变量区域
  const globalSection = document.createElement("div");
  globalSection.className = "sa-debugger-variables-section";
  const globalHeading = document.createElement("h3");
  globalHeading.textContent = msg("for-all-sprites");
  globalHeading.className = "sa-debugger-variables-heading";
  const globalList = document.createElement("div");
  globalList.className = "sa-debugger-variables-list";
  globalSection.appendChild(globalHeading);
  globalSection.appendChild(globalList);
  content.appendChild(globalSection);

  // 变量包装类
  class WrappedVariable {
    constructor(scratchVariable, target, isGlobal) {
      this.scratchVariable = scratchVariable;
      this.target = target;
      this.isGlobal = isGlobal;
      
      // 使用私有属性存储 checked 状态，防止被外部意外修改
      let _checked = true;
      Object.defineProperty(this, 'checked', {
        get: function() { return _checked; },
        set: function(value) { 
          _checked = !!value; 
        },
        enumerable: true,
        configurable: true
      });
      
      this.buildDOM();
    }

    buildDOM() {
      const row = document.createElement("div");
      row.className = "sa-debugger-variable-row";
      this.row = row;

      // 复选框（用于选择是否显示值）
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.checked;
      checkbox.className = "sa-debugger-variable-checkbox";
      checkbox.addEventListener("change", (e) => {
        this.checked = e.target.checked;
        this.updateDisplayMode();
        reorderVariables();
      });
      row.appendChild(checkbox);

      // 变量名
      const nameLabel = document.createElement("span");
      nameLabel.className = "sa-debugger-variable-name";
      nameLabel.textContent = this.scratchVariable.name + (this.scratchVariable.isCloud ? " ☁" : "");
      row.appendChild(nameLabel);

      // 值显示/编辑区域
      this.valueContainer = document.createElement("div");
      this.valueContainer.className = "sa-debugger-variable-value-container";
      
      if (this.scratchVariable.type === "list") {
        // 列表显示为多行文本
        this.valueElement = document.createElement("textarea");
        this.valueElement.className = "sa-debugger-variable-value sa-debugger-variable-list";
        this.valueElement.rows = 3;
      } else {
        // 普通变量显示为单行输入
        this.valueElement = document.createElement("input");
        this.valueElement.type = "text";
        this.valueElement.className = "sa-debugger-variable-value";
      }
      
      // 实时更新变量值
      this.valueElement.addEventListener("input", (e) => {
        this.updateVariableValue(e.target.value);
      });
      
      this.valueContainer.appendChild(this.valueElement);
      row.appendChild(this.valueContainer);

      this.updateDisplayMode();
    }

    // 根据勾选状态更新显示模式
    updateDisplayMode() {
      const checkbox = this.row.querySelector(".sa-debugger-variable-checkbox");
      
      if (this.checked) {
        // 勾选状态：显示完整行（名称+值输入框）
        this.row.classList.remove("sa-debugger-variable-unchecked");
        this.valueContainer.style.display = "";
      } else {
        // 未勾选状态：只显示名称，隐藏值输入框
        this.row.classList.add("sa-debugger-variable-unchecked");
        this.valueContainer.style.display = "none";
        
        // 强制同步：确保复选框 DOM 状态与 this.checked 一致
        if (checkbox && checkbox.checked) {
          checkbox.checked = false;
        }
      }
    }

    updateValue() {
      // 严格检查：未勾选时不更新值，强制隐藏值输入框
      if (!this.checked) {
        this.valueContainer.style.display = "none";
        return;
      }
      
      // 确保值容器可见（如果之前被隐藏了）
      if (this.valueContainer.style.display === "none") {
        this.valueContainer.style.display = "";
      }
      
      let newValue;
      if (this.scratchVariable.type === "list") {
        newValue = this.scratchVariable.value.join("\n");
      } else {
        newValue = String(this.scratchVariable.value);
      }

      // 只在值不同时更新，且输入框没有焦点时
      if (this.valueElement.value !== newValue && document.activeElement !== this.valueElement) {
        this.valueElement.value = newValue;
      }
    }

    updateVariableValue(value) {
      if (this.scratchVariable.type === "list") {
        this.scratchVariable.value = value.split("\n");
      } else {
        this.scratchVariable.value = value;
      }
    }

    handleSearch(search) {
      const name = this.scratchVariable.name.toLowerCase();
      const match = name.includes(search.toLowerCase());
      // 搜索不影响行的显示，只影响是否匹配搜索条件
      // 未勾选的变量保持显示（只显示名称）
      if (!match) {
        this.row.style.display = "none";
      } else {
        this.row.style.display = "";
      }
      return match;
    }
  }

  // 获取目标的所有变量
  const getVariablesForTarget = (target, isGlobal) => {
    const variables = [];
    if (!target) return variables;

    for (const [id, variable] of Object.entries(target.variables)) {
      variables.push(new WrappedVariable(variable, target, isGlobal));
    }
    return variables;
  };

  // 重新排序：勾选的在前，未勾选的在后
  const reorderVariables = () => {
    const sortFn = (a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? -1 : 1;
    };
    
    localVariables.sort(sortFn);
    localVariables.forEach(v => {
      localList.appendChild(v.row);
      // 重新排序后确保显示状态正确
      v.updateDisplayMode();
    });
    
    globalVariables.sort(sortFn);
    globalVariables.forEach(v => {
      globalList.appendChild(v.row);
      // 重新排序后确保显示状态正确
      v.updateDisplayMode();
    });
  };

  // 完全重新加载变量
  const fullReload = () => {
    // 保存现有变量的 checked 状态
    const checkedState = new Map();
    [...localVariables, ...globalVariables].forEach(v => {
      const key = v.scratchVariable.id || v.scratchVariable.name;
      checkedState.set(key, v.checked);
    });

    // 清空现有列表
    localList.innerHTML = "";
    globalList.innerHTML = "";
    localVariables = [];
    globalVariables = [];

    const editingTarget = vm.editingTarget;
    const stage = vm.runtime.getTargetForStage();

    // 获取当前角色的变量
    localVariables = getVariablesForTarget(editingTarget, false);
    localVariables.forEach(v => {
      // 恢复 checked 状态
      const key = v.scratchVariable.id || v.scratchVariable.name;
      if (checkedState.has(key)) {
        v.checked = checkedState.get(key);
        // 同步复选框 DOM 状态
        const checkbox = v.row.querySelector(".sa-debugger-variable-checkbox");
        if (checkbox) checkbox.checked = v.checked;
        v.updateDisplayMode();
      }
      localList.appendChild(v.row);
    });

    // 获取全局变量（从舞台获取）
    globalVariables = getVariablesForTarget(stage, true);
    globalVariables.forEach(v => {
      // 恢复 checked 状态
      const key = v.scratchVariable.id || v.scratchVariable.name;
      if (checkedState.has(key)) {
        v.checked = checkedState.get(key);
        // 同步复选框 DOM 状态
        const checkbox = v.row.querySelector(".sa-debugger-variable-checkbox");
        if (checkbox) checkbox.checked = v.checked;
        v.updateDisplayMode();
      }
      globalList.appendChild(v.row);
    });

    // 更新标题可见性
    updateHeadingVisibility();
  };

  const updateHeadingVisibility = () => {
    localHeading.style.display = localVariables.length === 0 ? "none" : "";
    globalHeading.style.display = globalVariables.length === 0 ? "none" : "";
  };

  // 快速更新（只更新勾选的变量）
  const quickUpdate = () => {
    [...localVariables, ...globalVariables].forEach(v => {
      if (v.checked) {
        v.updateValue();
      } else {
        // 未勾选的变量：强制保持值输入框隐藏
        if (v.valueContainer && v.valueContainer.style.display !== "none") {
          v.valueContainer.style.display = "none";
        }
      }
    });
  };

  // 搜索功能
  searchBox.addEventListener("input", (e) => {
    const search = e.target.value;
    [...localVariables, ...globalVariables].forEach(v => v.handleSearch(search));
    updateHeadingVisibility();
  });

  // 监听项目加载
  vm.runtime.on("PROJECT_LOADED", fullReload);
  
  // 监听角色切换 - 只在编辑目标变化时重新加载
  let lastEditingTargetId = null;
  vm.on("targetsUpdate", () => {
    const currentEditingTarget = vm.editingTarget;
    const currentId = currentEditingTarget ? currentEditingTarget.id : null;
    if (currentId !== lastEditingTargetId) {
      lastEditingTargetId = currentId;
      fullReload();
    }
  });

  // 初始加载
  fullReload();

  // 在每一步后更新变量值
  const originalStep = vm.runtime._step;
  vm.runtime._step = function(...args) {
    const ret = originalStep.apply(this, args);
    quickUpdate();
    return ret;
  };

  return {
    tab,
    content,
    buttons: [],
    show: () => {},
    hide: () => {},
  };
}
