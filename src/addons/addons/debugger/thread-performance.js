import Utils from "../find-bar/blockly/Utils.js";

export default async function createThreadPerformanceTab({ debug, addon }) {
  const vm = addon.tab.traps.vm;
  let isVisible = false;
  let searchQuery = "";
  let selectedTarget = "all";
  let trackAll = true;
  let currentPage = 1;
  const pageSize = 50;
  const selectionState = new Map();

  const isRowTracked = row => {
    if (!row || !row.threadKey) {
      return false;
    }
    const explicitState = selectionState.get(row.threadKey);
    if (trackAll) {
      return explicitState !== false;
    }
    return explicitState === true;
  };

  const tab = debug.createHeaderTab({
    text: "线程性能",
    icon: addon.self.getResource("/icons/performance.svg") /* rewritten by pull.js */,
  });

  const content = Object.assign(document.createElement("div"), {
    className: "sa-debugger-thread-perf",
  });

  const controls = document.createElement("div");
  controls.className = "sa-debugger-thread-perf-controls";

  const searchBox = document.createElement("input");
  searchBox.type = "text";
  searchBox.className = "sa-debugger-thread-perf-search";
  searchBox.placeholder = "搜索线程/角色/积木";
  searchBox.addEventListener("input", () => {
    searchQuery = searchBox.value.trim().toLowerCase();
    currentPage = 1;
    rebuildPerfTable();
  });
  controls.appendChild(searchBox);

  const targetFilter = document.createElement("select");
  targetFilter.className = "sa-debugger-thread-perf-filter";
  targetFilter.addEventListener("change", () => {
    selectedTarget = targetFilter.value;
    currentPage = 1;
    updateRuntimeSelection();
    rebuildPerfTable();
  });
  controls.appendChild(targetFilter);

  const clearButton = document.createElement("button");
  clearButton.className = "sa-debugger-thread-perf-clear";
  clearButton.textContent = "清空统计";
  clearButton.addEventListener("click", () => {
    if (vm.runtime.resetThreadPerfStats) {
      vm.runtime.resetThreadPerfStats();
    }
    rebuildPerfTable();
  });
  controls.appendChild(clearButton);

  const uncheckAllButton = document.createElement("button");
  uncheckAllButton.className = "sa-debugger-thread-perf-clear";
  uncheckAllButton.textContent = "全部取消";
  uncheckAllButton.addEventListener("click", () => {
    trackAll = false;
    const rows = vm.runtime.getThreadPerfSnapshot ? vm.runtime.getThreadPerfSnapshot() : [];
    for (const row of rows) {
      if (row && row.threadKey) {
        selectionState.set(row.threadKey, false);
      }
    }
    if (vm.runtime.setThreadPerfSelection) {
      vm.runtime.setThreadPerfSelection({trackAll: false, selectedKeys: []});
    }
    currentPage = 1;
    rebuildPerfTable();
  });
  controls.appendChild(uncheckAllButton);

  const checkAllButton = document.createElement("button");
  checkAllButton.className = "sa-debugger-thread-perf-clear";
  checkAllButton.textContent = "全部侦测";
  checkAllButton.addEventListener("click", () => {
    trackAll = true;
    for (const key of selectionState.keys()) {
      selectionState.set(key, true);
    }
    if (vm.runtime.setThreadPerfSelection) {
      vm.runtime.setThreadPerfSelection({trackAll: true, excludedKeys: []});
    }
    currentPage = 1;
    rebuildPerfTable();
  });
  controls.appendChild(checkAllButton);

  const pageControls = document.createElement("div");
  pageControls.className = "sa-debugger-thread-perf-controls";

  const prevPageButton = document.createElement("button");
  prevPageButton.className = "sa-debugger-thread-perf-clear";
  prevPageButton.textContent = "上一页";
  prevPageButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      rebuildPerfTable();
    }
  });
  pageControls.appendChild(prevPageButton);

  const pageInfo = document.createElement("span");
  pageInfo.className = "sa-debugger-thread-perf-page-info";
  pageControls.appendChild(pageInfo);

  const nextPageButton = document.createElement("button");
  nextPageButton.className = "sa-debugger-thread-perf-clear";
  nextPageButton.textContent = "下一页";
  nextPageButton.addEventListener("click", () => {
    currentPage += 1;
    rebuildPerfTable();
  });
  pageControls.appendChild(nextPageButton);

  const switchToSprite = (targetId) => {
    if (vm.editingTarget && targetId !== vm.editingTarget.id) {
      if (vm.runtime.getTargetById(targetId)) {
        vm.setEditingTarget(targetId);
      }
    }
  };

  const activateCodeTab = () => {
    const redux = addon.tab.redux;
    if (redux.state.scratchGui.editorTab.activeTabIndex !== 0) {
      redux.dispatch({
        type: "scratch-gui/navigation/ACTIVATE_TAB",
        activeTabIndex: 0,
      });
    }
  };

  const goToBlock = (blockId) => {
    const workspace = Blockly.getMainWorkspace();
    const block = workspace.getBlockById(blockId);
    if (!block || block.workspace.isFlyout) return;
    new Utils(addon).scrollBlockIntoView(blockId);
  };

  const perfTable = document.createElement("table");
  perfTable.className = "sa-debugger-thread-perf-table";
  content.appendChild(controls);
  content.appendChild(pageControls);
  content.appendChild(perfTable);

  const getFilteredRows = () => {
    const rows = vm.runtime.getThreadPerfSnapshot ? vm.runtime.getThreadPerfSnapshot() : [];
    const targetNames = new Set(["all"]);
    for (const row of rows) {
      if (row.targetName) targetNames.add(row.targetName);
      if (trackAll && !selectionState.has(row.threadKey)) {
        selectionState.set(row.threadKey, true);
      }
    }
    const currentValue = targetFilter.value || "all";
    targetFilter.innerHTML = "";
    for (const targetName of targetNames) {
      const option = document.createElement("option");
      option.value = targetName;
      option.textContent = targetName === "all" ? "所有角色" : targetName;
      if (targetName === (selectedTarget || currentValue)) {
        option.selected = true;
      }
      targetFilter.appendChild(option);
    }
    selectedTarget = targetFilter.value || "all";
    return rows.filter(row => {
      if (selectedTarget !== "all" && row.targetName !== selectedTarget) {
        return false;
      }
      if (!searchQuery) {
        return true;
      }
      const haystack = [row.threadKey, row.targetName, row.topBlockId].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(searchQuery);
    }).sort((a, b) => {
      const aTracked = isRowTracked(a) ? 1 : 0;
      const bTracked = isRowTracked(b) ? 1 : 0;
      if (aTracked !== bTracked) {
        return bTracked - aTracked;
      }
      return (b.avgTime || 0) - (a.avgTime || 0);
    });
  };

  const updateRuntimeSelection = () => {
    if (!vm.runtime.setThreadPerfSelection) {
      return;
    }
    if (trackAll) {
      const excludedKeys = Array.from(selectionState.entries())
        .filter(([, selected]) => !selected)
        .map(([key]) => key);
      vm.runtime.setThreadPerfSelection({trackAll: true, excludedKeys});
    } else {
      const selectedKeys = Array.from(selectionState.entries())
        .filter(([, selected]) => selected)
        .map(([key]) => key);
      vm.runtime.setThreadPerfSelection({trackAll: false, selectedKeys});
    }
  };

  const rebuildPerfTable = () => {
    const rows = getFilteredRows();
    updateRuntimeSelection();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    const startIndex = (currentPage - 1) * pageSize;
    const visibleRows = rows.slice(startIndex, startIndex + pageSize);
    pageInfo.textContent = rows.length > pageSize ? `第 ${currentPage} / ${totalPages} 页，共 ${rows.length} 条` : `共 ${rows.length} 条`;
    prevPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;
    pageControls.style.display = rows.length > pageSize ? "flex" : "none";
    perfTable.innerHTML = "";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["监控", "线程", "角色", "顶部积木", "最近一次", "平均", "最大", "次数", "总耗时"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    perfTable.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of visibleRows) {
      const tr = document.createElement("tr");

      const selectTd = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isRowTracked(row);
      checkbox.addEventListener("change", () => {
        selectionState.set(row.threadKey, checkbox.checked);
        if (trackAll && checkbox.checked) {
          selectionState.delete(row.threadKey);
        }
        updateRuntimeSelection();
        currentPage = 1;
        rebuildPerfTable();
      });
      selectTd.appendChild(checkbox);
      tr.appendChild(selectTd);

      const threadTd = document.createElement("td");
      threadTd.textContent = row.threadKey || "";
      tr.appendChild(threadTd);

      const targetTd = document.createElement("td");
      targetTd.textContent = row.targetName || "";
      tr.appendChild(targetTd);

      const blockTd = document.createElement("td");
      if (row.targetId && row.topBlockId) {
        const preview = debug.createBlockPreview(row.targetId, row.topBlockId);
        if (preview) {
          blockTd.appendChild(preview);
        }
        const link = debug.createBlockLink(debug.getTargetInfoById(row.targetId), row.topBlockId);
        blockTd.appendChild(link);
        blockTd.className = "sa-debugger-thread-perf-block";
        blockTd.addEventListener("mousedown", () => {
          switchToSprite(row.targetId);
          activateCodeTab();
          goToBlock(row.topBlockId);
        });
      } else {
        blockTd.textContent = row.topBlockId || "";
      }
      tr.appendChild(blockTd);

      const numericValues = [
        `${(row.lastTime || 0).toFixed(3)}ms`,
        `${(row.avgTime || 0).toFixed(3)}ms`,
        `${(row.maxTime || 0).toFixed(3)}ms`,
        String(row.count || 0),
        `${(row.totalTime || 0).toFixed(3)}ms`
      ];
      for (const value of numericValues) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    perfTable.appendChild(tbody);
  };

  debug.addThrottledAfterStepCallback(() => {
    if (!isVisible) {
      return;
    }
    rebuildPerfTable();
  }, 250);

  const show = () => {
    isVisible = true;
    currentPage = 1;
    if (vm.runtime.setThreadPerfEnabled) {
      vm.runtime.setThreadPerfEnabled(true);
    }
    updateRuntimeSelection();
    rebuildPerfTable();
  };

  const hide = () => {
    isVisible = false;
    if (vm.runtime.setThreadPerfEnabled) {
      vm.runtime.setThreadPerfEnabled(false);
    }
  };

  return {
    tab,
    content,
    buttons: [],
    show,
    hide,
  };
}
