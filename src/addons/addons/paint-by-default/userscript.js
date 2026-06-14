export default async function ({ addon, console }) {
  const spriteMeta = Object.assign(Object.create(null), {
    upload: {
      index: 0,
      tooltip: "gui.spriteSelector.addSpriteFromFile",
    },
    surprise: {
      index: 1,
      tooltip: "gui.spriteSelector.addSpriteFromSurprise",
    },
    paint: {
      index: 2,
      tooltip: "gui.spriteSelector.addSpriteFromPaint",
    },
    library: {
      index: 3,
      tooltip: "gui.spriteSelector.addSpriteFromLibrary",
    },
  });
  const backdropMeta = Object.assign(Object.create(null), {
    upload: {
      index: 0,
      tooltip: "gui.stageSelector.addBackdropFromFile",
    },
    surprise: {
      index: 1,
      tooltip: "gui.stageSelector.addBackdropFromSurprise",
    },
    paint: {
      index: 2,
      tooltip: "gui.stageSelector.addBackdropFromPaint",
    },
    library: {
      index: 3,
      tooltip: "gui.spriteSelector.addBackdropFromLibrary",
    },
  });
  const costumeMeta = Object.assign(Object.create(null), {
    upload: {
      index: 0,
      tooltip: "gui.costumeTab.addFileCostume",
    },
    surprise: {
      index: 1,
      tooltip: "gui.costumeTab.addSurpriseCostume",
    },
    paint: {
      index: 2,
      tooltip: "gui.costumeTab.addBlankCostume",
    },
    library: {
      index: 3,
      tooltip: "gui.costumeTab.addCostumeFromLibrary",
    },
  });
  const soundMeta = Object.assign(Object.create(null), {
    upload: {
      index: 0,
      tooltip: "gui.soundTab.fileUploadSound",
    },
    surprise: {
      index: 1,
      tooltip: "gui.soundTab.surpriseSound",
    },
    record: {
      index: 2,
      tooltip: "gui.soundTab.recordSound",
    },
    library: {
      index: 3,
      tooltip: "gui.soundTab.addSoundFromLibrary",
    },
  });
  const getSetting = (id) => {
    if (addon.self.disabled) {
      return "library";
    }
    return addon.settings.get(id);
  };
  const isSupportedMainButton = (mainButton) => {
    if (!mainButton) {
      return false;
    }
    const assetPanelWrapper = mainButton.closest("[class*=asset-panel_wrapper_]");
    const stageSelector = mainButton.closest('[class*="target-pane_stage-selector-wrapper"]');
    if (assetPanelWrapper || stageSelector) {
      return true;
    }

    const spriteSelector = mainButton.closest('[class*="sprite-selector"]');
    if (!spriteSelector) {
      return false;
    }

    const moreButtonsElement = mainButton.parentElement &&
      mainButton.parentElement.querySelector('[class*="action-menu_more-buttons_"]');
    return Boolean(moreButtonsElement && moreButtonsElement.children && moreButtonsElement.children.length >= 4);
  };
  const getButtonToClick = (mainButton) => {
    const assetPanelWrapper = mainButton.closest("[class*=asset-panel_wrapper_]");
    if (assetPanelWrapper) {
      if (addon.tab.redux.state.scratchGui.editorTab.activeTabIndex === 2) {
        return soundMeta[getSetting("sound")] || soundMeta.library;
      } else {
        return costumeMeta[getSetting("costume")] || costumeMeta.library;
      }
    } else if (mainButton.closest('[class*="target-pane_stage-selector-wrapper"]')) {
      return backdropMeta[getSetting("backdrop")] || backdropMeta.library;
    } else {
      return spriteMeta[getSetting("sprite")] || spriteMeta.library;
    }
  };
  document.body.addEventListener(
    "click",
    (e) => {
      if (addon.self.disabled) {
        return;
      }
      const mainButton = e.target.closest('[class*="action-menu_main-button_"]');
      if (!mainButton) {
        return;
      }
      if (!isSupportedMainButton(mainButton)) {
        return;
      }
      e.stopPropagation();
      const moreButtonsElement = mainButton.parentElement.querySelector('[class*="action-menu_more-buttons_"]');
      if (!moreButtonsElement || !moreButtonsElement.children || moreButtonsElement.children.length < 4) {
        return;
      }
      const moreButtons = moreButtonsElement.children;
      const { index } = getButtonToClick(mainButton);
      // better-img-uploads can add a button at the start, so search "from the end" for compatibility
      const buttonToClick = moreButtons[moreButtons.length - (4 - index)];
      if (!buttonToClick) {
        return;
      }
      const elementToClick = buttonToClick.querySelector("button");
      if (!elementToClick) {
        return;
      }
      elementToClick.click();
    },
    {
      bubble: true,
    }
  );
  document.body.addEventListener(
    "mouseover",
    (e) => {
      const mainButton = e.target.closest('[class*="action-menu_main-button_"]');
      if (!mainButton) {
        return;
      }
      if (!isSupportedMainButton(mainButton)) {
        return;
      }
      const tooltipElement = mainButton.parentElement.querySelector(".__react_component_tooltip");
      if (!tooltipElement) {
        return;
      }
      const { tooltip } = getButtonToClick(mainButton);
      const translatedTooltip = addon.tab.redux.state.locales.messages[tooltip];
      const needToFixTooltipText = translatedTooltip && tooltipElement.textContent !== translatedTooltip;
      if (needToFixTooltipText) {
        tooltipElement.textContent = translatedTooltip;
        setTimeout(() => {
          tooltipElement.textContent = translatedTooltip;
          mainButton.dispatchEvent(new Event("mouseenter"));
        });
      }
    },
    {
      bubble: true,
    }
  );
}
