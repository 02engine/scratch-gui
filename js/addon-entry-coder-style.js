(window["webpackJsonpGUI"] = window["webpackJsonpGUI"] || []).push([["addon-entry-coder-style"],{

/***/ "./node_modules/css-loader/index.js!./src/addons/addons/coder-style/coder-style.css":
/*!*********************************************************************************!*\
  !*** ./node_modules/css-loader!./src/addons/addons/coder-style/coder-style.css ***!
  \*********************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

exports = module.exports = __webpack_require__(/*! ../../../../node_modules/css-loader/lib/css-base.js */ "./node_modules/css-loader/lib/css-base.js")(false);
// imports


// module
exports.push([module.i, "/* 积木主体路径极低透明度 */\n.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable .blocklyPath {\n  opacity: var(--coder-style-block-opacity, 0.02) !important;\n}\n\n/* 积木文字显示分类颜色 */\n.blocklyText {\n  fill: currentColor !important;\n}\n\n/* 拖拽时的积木保持可见 */\n.blocklyBlockDragSurface .blocklyPath {\n  opacity: 0.3 !important;\n}\n\n/* 悬停时的积木稍微可见 */\n.blocklyDraggable:hover .blocklyPath {\n  opacity: calc(var(--coder-style-block-opacity, 0.02) * 2) !important;\n}\n\n/* 选中状态的积木稍微可见 */\n.blocklySelected .blocklyPath {\n  opacity: 0.05 !important;\n}\n\n/* 飞出面板中的积木稍微可见 */\n.blocklyFlyout > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable .blocklyPath {\n  opacity: 0.04 !important;\n}\n\n/* 确保积木连接点保持可见 */\n.blocklyPath.blocklyNotch {\n  opacity: 0.1 !important;\n}\n\n/* 确保 SVG 元素可交互 */\n.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable {\n  pointer-events: auto !important;\n}", ""]);

// exports


/***/ }),

/***/ "./src/addons/addons/coder-style/_runtime_entry.js":
/*!*********************************************************!*\
  !*** ./src/addons/addons/coder-style/_runtime_entry.js ***!
  \*********************************************************/
/*! exports provided: resources */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "resources", function() { return resources; });
/* harmony import */ var _userscript_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./userscript.js */ "./src/addons/addons/coder-style/userscript.js");
/* harmony import */ var _css_loader_coder_style_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! css-loader!./coder-style.css */ "./node_modules/css-loader/index.js!./src/addons/addons/coder-style/coder-style.css");
/* harmony import */ var _css_loader_coder_style_css__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_css_loader_coder_style_css__WEBPACK_IMPORTED_MODULE_1__);


const resources = {
  "userscript.js": _userscript_js__WEBPACK_IMPORTED_MODULE_0__["default"],
  "coder-style.css": _css_loader_coder_style_css__WEBPACK_IMPORTED_MODULE_1___default.a
};

/***/ }),

/***/ "./src/addons/addons/coder-style/userscript.js":
/*!*****************************************************!*\
  !*** ./src/addons/addons/coder-style/userscript.js ***!
  \*****************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = (async function (_ref) {
  let {
    addon,
    console,
    msg
  } = _ref;
  const Blockly = await addon.tab.traps.getBlockly();

  // 获取透明度设置
  const getBlockOpacity = () => addon.settings.get("block-opacity") || 0.02;
  const getCShapeOpacity = () => addon.settings.get("c-shape-opacity") || 0.08;
  const getBooleanOpacity = () => addon.settings.get("boolean-opacity") || 0.15;
  const getInputOpacity = () => addon.settings.get("input-opacity") || 0.12;

  // 判断积木类型
  const isRoundBlock = block => block.outputShape_ === Blockly.OUTPUT_SHAPE_ROUND;
  const isHexagonBlock = block => block.outputShape_ === Blockly.OUTPUT_SHAPE_HEXAGONAL;
  const isSquareInputBlock = block => block.outputShape_ === Blockly.OUTPUT_SHAPE_SQUARE && !block.outputConnection;
  const needsLeftBorder = block => !isRoundBlock(block) && !isHexagonBlock(block) && !isSquareInputBlock(block);

  // 清理积木的装饰元素
  const clearBlockDecorations = block => {
    if (block.coderStyleDecorations_) {
      block.coderStyleDecorations_.forEach(el => el.remove());
      block.coderStyleDecorations_ = null;
    }
  };

  // 为圆形积木创建左右圆角弧线，类似 (  )
  const createRoundDecorations = (block, color, height, width) => {
    const svgGroup = block.getSvgRoot();
    const pathElement = block.svgPath_;
    if (!pathElement) return [];
    const decorations = [];
    // 圆角半径与积木高度匹配，使用高度的40%
    const cornerRadius = height;
    const strokeWidth = 0;

    // 左圆角弧线 - 往外凸，使用 A 命令，类似 (
    const leftArc = Blockly.utils.createSvgElement("path", {
      d: "M ".concat(cornerRadius / 2, " ").concat(cornerRadius, " A ").concat(height / 2, " ").concat(height / 2, " 0 0 1 ").concat(cornerRadius / 2, " ").concat(height - cornerRadius),
      fill: "none",
      stroke: color,
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    decorations.push(leftArc);

    // 右圆角弧线 - 往外凸，使用 A 命令，类似 )
    const rightArc = Blockly.utils.createSvgElement("path", {
      d: "M ".concat(width - cornerRadius / 2, " ").concat(cornerRadius, " A ").concat(height / 2, " ").concat(height / 2, " 0 0 0 ").concat(width - cornerRadius / 2, " ").concat(height - cornerRadius),
      fill: "none",
      stroke: color,
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    decorations.push(rightArc);

    // 将所有装饰添加到 SVG 组中，放在路径之前
    decorations.forEach(decoration => {
      svgGroup.insertBefore(decoration, pathElement);
    });
    return decorations;
  };

  // 为六边形积木创建左右棱角，类似 <>
  const createHexagonDecorations = (block, color, height, width) => {
    const svgGroup = block.getSvgRoot();
    const pathElement = block.svgPath_;
    if (!pathElement) return [];
    const decorations = [];
    // 棱角大小与积木高度匹配，使用高度的30%
    const cornerSize = height;
    const strokeWidth = 2;

    // 左棱角 - 45度，形成 <
    const leftCorner = Blockly.utils.createSvgElement("path", {
      d: "M ".concat(cornerSize / 2, " ").concat(cornerSize, " L ", 0, " ").concat(height / 2, " L ").concat(cornerSize / 2, " ").concat(height - cornerSize),
      fill: "none",
      stroke: color,
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    decorations.push(leftCorner);

    // 右棱角 - 45度，形成 >
    const rightCorner = Blockly.utils.createSvgElement("path", {
      d: "M ".concat(width - cornerSize / 2, " ").concat(cornerSize, " L ").concat(width, " ").concat(height / 2, " L ").concat(width - cornerSize / 2, " ").concat(height - cornerSize),
      fill: "none",
      stroke: color,
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    decorations.push(rightCorner);

    // 将所有装饰添加到 SVG 组中，放在路径之前
    decorations.forEach(decoration => {
      svgGroup.insertBefore(decoration, pathElement);
    });
    return decorations;
  };

  // 为积木添加或更新左端竖线（普通积木）
  const updateLeftBorder = block => {
    if (!needsLeftBorder(block)) {
      if (block.coderStyleLeftBorder_) {
        block.coderStyleLeftBorder_.remove();
        block.coderStyleLeftBorder_ = null;
      }
      return;
    }
    const color = block.getColour();
    const svgGroup = block.getSvgRoot();
    const pathElement = block.svgPath_;
    if (!pathElement) return;
    const height = block.height;
    const width = block.width;
    if (block.coderStyleLeftBorder_) {
      block.coderStyleLeftBorder_.setAttribute("stroke", color);
      block.coderStyleLeftBorder_.setAttribute("x1", 0);
      block.coderStyleLeftBorder_.setAttribute("x2", 0);
      block.coderStyleLeftBorder_.setAttribute("y1", 0);
      block.coderStyleLeftBorder_.setAttribute("y2", height);
      return;
    }
    const line = Blockly.utils.createSvgElement("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: height,
      stroke: color,
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    svgGroup.insertBefore(line, pathElement);
    block.coderStyleLeftBorder_ = line;
  };

  // 更新积木的装饰元素
  const updateBlockDecorations = block => {
    clearBlockDecorations(block);
    const color = block.getColour();
    const height = block.height;
    const width = block.width;
    if (isRoundBlock(block)) {
      block.coderStyleDecorations_ = createRoundDecorations(block, color, height, width);
    } else if (isHexagonBlock(block)) {
      block.coderStyleDecorations_ = createHexagonDecorations(block, color, height, width);
    } else {
      updateLeftBorder(block);
    }
  };

  // Patch FieldLabel.prototype.init 设置文字颜色
  const oldFieldLabelInit = Blockly.FieldLabel.prototype.init;
  Blockly.FieldLabel.prototype.init = function () {
    oldFieldLabelInit.call(this);
    if (!addon.self.disabled) {
      const block = this.sourceBlock_;
      if (block) {
        const color = block.getColourTertiary();
        this.textElement_.style.setProperty("fill", color, "important");
      }
    }
  };

  // Patch FieldVariableGetter.prototype.init 设置变量积木文字颜色
  const oldFieldVariableGetterInit = Blockly.FieldVariableGetter.prototype.init;
  Blockly.FieldVariableGetter.prototype.init = function () {
    oldFieldVariableGetterInit.call(this);
    if (!addon.self.disabled) {
      const block = this.sourceBlock_;
      if (block) {
        const color = block.getColourTertiary();
        this.textElement_.style.setProperty("fill", color, "important");
      }
    }
  };

  // Patch BlockSvg.prototype.render 更新积木装饰
  const oldBlockRender = Blockly.BlockSvg.prototype.render;
  Blockly.BlockSvg.prototype.render = function (opt_bubble) {
    oldBlockRender.call(this, opt_bubble);
    if (!addon.self.disabled) {
      updateBlockDecorations(this);
    }
  };

  // Patch BlockSvg.prototype.updateColour 设置积木透明度
  const oldBlockUpdateColour = Blockly.BlockSvg.prototype.updateColour;
  Blockly.BlockSvg.prototype.updateColour = function () {
    oldBlockUpdateColour.call(this);
    if (!addon.self.disabled && this.svgPath_) {
      const color = this.getColour();
      let opacity = getBlockOpacity();
      if (isHexagonBlock(this)) {
        opacity = getBooleanOpacity();
        this.svgPath_.style.opacity = opacity;
      } else if (isRoundBlock(this)) {
        opacity = getInputOpacity();
        this.svgPath_.style.opacity = opacity;
      } else if (isSquareInputBlock(this)) {
        opacity = getInputOpacity();
        this.svgPath_.style.stroke = color;
        this.svgPath_.style.strokeWidth = '1px';
        this.svgPath_.style.opacity = opacity;
      } else if (this.inputList.some(input => input.type === Blockly.INPUT_STATEMENT)) {
        opacity = getCShapeOpacity();
        this.svgPath_.style.opacity = opacity;
      } else {
        this.svgPath_.style.opacity = opacity;
      }

      // 更新装饰颜色
      if (this.coderStyleDecorations_) {
        this.coderStyleDecorations_.forEach(el => {
          el.setAttribute("stroke", color);
        });
      }

      // 更新左端竖线颜色
      if (this.coderStyleLeftBorder_) {
        this.coderStyleLeftBorder_.setAttribute("stroke", color);
      }
    }
  };

  // 监听积木销毁事件，清理装饰元素
  const oldBlockDispose = Blockly.BlockSvg.prototype.dispose;
  Blockly.BlockSvg.prototype.dispose = function () {
    clearBlockDecorations(this);
    if (this.coderStyleLeftBorder_) {
      this.coderStyleLeftBorder_.remove();
      this.coderStyleLeftBorder_ = null;
    }
    oldBlockDispose.call(this);
  };

  // 监听设置变化
  addon.settings.addEventListener("change", () => {
    Blockly.getMainWorkspace().getAllBlocks().forEach(block => {
      block.updateColour();
    });
  });
});

/***/ })

}]);
//# sourceMappingURL=addon-entry-coder-style.js.map