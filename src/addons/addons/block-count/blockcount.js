export default async function ({ addon, console, msg }) {
  const vm = addon.tab.traps.vm;

  // Map opcode prefix to category
  const getCategoryFromOpcode = (opcode) => {
    if (!opcode) return null;

    // Standard Scratch categories
    if (opcode.startsWith('motion_')) return 'motion';
    if (opcode.startsWith('looks_')) return 'looks';
    if (opcode.startsWith('sound_')) return 'sound';
    if (opcode.startsWith('event_')) return 'event';
    if (opcode.startsWith('control_')) return 'control';
    if (opcode.startsWith('sensing_')) return 'sensing';
    if (opcode.startsWith('operator_')) return 'operators';
    if (opcode.startsWith('data_')) return 'data';
    if (opcode.startsWith('procedures_')) return 'procedures';
    if (opcode.startsWith('argument_')) return 'procedures'; // Custom block arguments

    // Extension blocks - extract extension name from opcode
    // Format is usually: extensionName_blockName
    const parts = opcode.split('_');
    if (parts.length > 1) {
      return `ext_${parts[0]}`; // e.g., "ext_pen", "ext_music"
    }

    return null;
  };

  const getBlockCount = () => {
    let blockCount = 0;
    let scriptCount = 0;
    const categories = {};

    let sprites = new Set(vm.runtime.targets.map((i) => i.sprite.blocks._blocks));
    sprites.forEach((sprite, i) => {
      Object.values(sprite).forEach((block) => {
        if (!block.shadow) {
          blockCount++;

          // Count by category
          const category = getCategoryFromOpcode(block.opcode);
          if (category) {
            categories[category] = (categories[category] || 0) + 1;
          }
        }

        // Count scripts (top-level blocks)
        if (!block.parent && !block.shadow) {
          scriptCount++;
        }
      });
    });

    return {
      blockCount,
      scriptCount,
      spriteCount: sprites.size - 1, // Backdrop counts as a target so we can subtract it
      categories
    };
  };

  // Get localized category name
  const getCategoryName = (categoryKey) => {
    const categoryNames = {
      motion: msg('category-motion'),
      looks: msg('category-looks'),
      sound: msg('category-sound'),
      event: msg('category-event'),
      control: msg('category-control'),
      sensing: msg('category-sensing'),
      operators: msg('category-operators'),
      data: msg('category-data'),
      procedures: msg('category-procedures')
    };

    // For standard categories, use localized name
    if (categoryNames[categoryKey]) {
      return categoryNames[categoryKey];
    }

    // For extensions, extract the extension name
    if (categoryKey.startsWith('ext_')) {
      const extName = categoryKey.substring(4); // Remove 'ext_' prefix
      // Try to get the extension's display name from Scratch
      // For now, just capitalize the extension name
      return extName.charAt(0).toUpperCase() + extName.slice(1);
    }

    return categoryKey;
  };

  const addLiveBlockCount = async () => {
    if (vm.editingTarget) {
      let handler = null;
      let isExpanded = false; // Track expansion state

      while (true) {
        const topBar = await addon.tab.waitForElement("[class^='menu-bar_main-menu']", {
          markAsSeen: true,
          reduxEvents: [
            "scratch-gui/mode/SET_PLAYER",
            "fontsLoaded/SET_FONTS_LOADED",
            "scratch-gui/locales/SELECT_LOCALE",
          ],
          reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
        });

        // Create container for block count display
        let container = topBar.appendChild(document.createElement("div"));
        addon.tab.displayNoneWhileDisabled(container);
        container.style.order = 1;
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "8px";
        container.style.marginLeft = "8px";

        // Create main display (total count + arrow)
        let mainDisplay = container.appendChild(document.createElement("span"));
        mainDisplay.style.display = "flex";
        mainDisplay.style.alignItems = "center";
        mainDisplay.style.gap = "4px";
        mainDisplay.style.cursor = "pointer";
        mainDisplay.style.userSelect = "none";

        // Total count text
        let countText = mainDisplay.appendChild(document.createElement("span"));
        countText.innerText = msg("blocks", { num: getBlockCount().blockCount });

        // Arrow button
        let arrow = mainDisplay.appendChild(document.createElement("span"));
        arrow.innerText = "▶";
        arrow.style.fontSize = "10px";
        arrow.style.transition = "transform 0.2s";
        arrow.style.display = "inline-block";

        // Category details panel (initially hidden) - styled as dropdown
        let detailsPanel = container.appendChild(document.createElement("div"));
        detailsPanel.style.display = "none";
        detailsPanel.style.position = "absolute";
        detailsPanel.style.top = "calc(100% + 4px)";
        detailsPanel.style.left = "0";
        detailsPanel.style.backgroundColor = "white";
        detailsPanel.style.border = "1px solid #d9d9d9";
        detailsPanel.style.borderRadius = "4px";
        detailsPanel.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
        detailsPanel.style.padding = "8px";
        detailsPanel.style.minWidth = "180px";
        detailsPanel.style.zIndex = "1000";
        detailsPanel.style.fontSize = "12px";

        // Make container position relative for absolute positioning of dropdown
        container.style.position = "relative";

        // Update display function
        const updateDisplay = () => {
          const counts = getBlockCount();
          countText.innerText = msg("blocks", { num: counts.blockCount });

          // Clear and rebuild details panel
          detailsPanel.innerHTML = "";

          // Standard categories in fixed order (always show these)
          const standardCategories = [
            'motion', 'looks', 'sound', 'event',
            'control', 'sensing', 'operators', 'data', 'procedures'
          ];

          // Collect extension categories
          const extensionCategories = Object.keys(counts.categories)
            .filter(cat => cat.startsWith('ext_'))
            .sort();

          // Display standard categories first
          standardCategories.forEach(category => {
            const count = counts.categories[category] || 0;
            const item = detailsPanel.appendChild(document.createElement("div"));
            item.style.padding = "4px 8px";
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.gap = "12px";
            item.style.borderRadius = "2px";
            item.style.transition = "background-color 0.1s";

            // Hover effect
            item.addEventListener("mouseenter", () => {
              item.style.backgroundColor = "#f0f0f0";
            });
            item.addEventListener("mouseleave", () => {
              item.style.backgroundColor = "transparent";
            });

            const nameSpan = item.appendChild(document.createElement("span"));
            nameSpan.innerText = getCategoryName(category);
            nameSpan.style.color = count > 0 ? "#575e75" : "#999";

            const countSpan = item.appendChild(document.createElement("span"));
            countSpan.innerText = count.toString();
            countSpan.style.fontWeight = "bold";
            countSpan.style.color = count > 0 ? "#4c97ff" : "#ccc";
          });

          // Add separator if there are extensions
          if (extensionCategories.length > 0) {
            const separator = detailsPanel.appendChild(document.createElement("div"));
            separator.style.height = "1px";
            separator.style.backgroundColor = "#e0e0e0";
            separator.style.margin = "4px 0";
          }

          // Display extensions
          extensionCategories.forEach(category => {
            const count = counts.categories[category] || 0;
            if (count > 0) {
              const item = detailsPanel.appendChild(document.createElement("div"));
              item.style.padding = "4px 8px";
              item.style.display = "flex";
              item.style.justifyContent = "space-between";
              item.style.gap = "12px";
              item.style.borderRadius = "2px";
              item.style.transition = "background-color 0.1s";

              // Hover effect
              item.addEventListener("mouseenter", () => {
                item.style.backgroundColor = "#f0f0f0";
              });
              item.addEventListener("mouseleave", () => {
                item.style.backgroundColor = "transparent";
              });

              const nameSpan = item.appendChild(document.createElement("span"));
              nameSpan.innerText = getCategoryName(category);
              nameSpan.style.color = "#575e75";

              const countSpan = item.appendChild(document.createElement("span"));
              countSpan.innerText = count.toString();
              countSpan.style.fontWeight = "bold";
              countSpan.style.color = "#0fbd8c";
            }
          });
        };

        // Toggle expansion
        const toggleExpansion = () => {
          isExpanded = !isExpanded;

          if (isExpanded) {
            arrow.style.transform = "rotate(90deg)";
            detailsPanel.style.display = "block";
            updateDisplay();
          } else {
            arrow.style.transform = "rotate(0deg)";
            detailsPanel.style.display = "none";
          }
        };

        // Click handler
        mainDisplay.addEventListener("click", toggleExpansion);

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
          if (!container.contains(e.target) && isExpanded) {
            toggleExpansion();
          }
        });

        // Initial display
        updateDisplay();

        // Debounced update on project changes
        let debounce;
        if (handler) {
          vm.off("PROJECT_CHANGED", handler);
          vm.runtime.off("PROJECT_LOADED", handler);
        }

        handler = async () => {
          clearTimeout(debounce);
          debounce = setTimeout(async () => {
            updateDisplay();
          }, 1000);
        };

        vm.on("PROJECT_CHANGED", handler);
        vm.runtime.on("PROJECT_LOADED", handler);
      }
    } else {
      let timeout = setTimeout(function () {
        addLiveBlockCount();
        clearTimeout(timeout);
      }, 1000);
    }
  };

  addLiveBlockCount();
}
