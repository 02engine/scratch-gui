import LazyScratchBlocks from './tw-lazy-scratch-blocks';

const applyScratchBlocksPerformancePatches = ScratchBlocks => {
    if (!ScratchBlocks || ScratchBlocks.__twPerformancePatchesApplied) {
        return;
    }
    ScratchBlocks.__twPerformancePatchesApplied = true;

    const workspaceProto = ScratchBlocks.WorkspaceSvg && ScratchBlocks.WorkspaceSvg.prototype;
    const draggerProto = ScratchBlocks.WorkspaceDragger && ScratchBlocks.WorkspaceDragger.prototype;
    const intersectionProto = ScratchBlocks.IntersectionObserver && ScratchBlocks.IntersectionObserver.prototype;
    const blockProto = ScratchBlocks.BlockSvg && ScratchBlocks.BlockSvg.prototype;

    if (workspaceProto) {
        workspaceProto.offscreenTopBlockCullingEnabled_ = false;
        workspaceProto.deferBlockRendering_ = false;
        workspaceProto.intersectionCheckPendingAfterDrag_ = false;
        workspaceProto.pendingWheelFrame_ = null;
        workspaceProto.pendingWheelScrollDelta_ = null;
        workspaceProto.pendingWheelZoomDelta_ = 0;
        workspaceProto.pendingWheelZoomPosition_ = null;
        workspaceProto.pendingGridUpdateTimer_ = null;
        workspaceProto.deferGridUpdate_ = false;

        workspaceProto.setOffscreenTopBlockCullingEnabled = function (enabled) {
            if (this.offscreenTopBlockCullingEnabled_ === enabled) {
                if (enabled) this.queueIntersectionCheck();
                return;
            }
            this.offscreenTopBlockCullingEnabled_ = enabled;

            const topBlocks = this.getTopBlocks(false);
            let needsFullRender = false;
            for (const block of topBlocks) {
                if (block.setIntersects) block.setIntersects(true);
                if (!enabled && block.deferredRenderPending_) {
                    needsFullRender = true;
                }
            }

            if (!enabled && needsFullRender) {
                this.render();
                if (!this.isFlyout) {
                    setTimeout(() => {
                        for (const block of topBlocks) {
                            if (block.workspace) {
                                block.setConnectionsHidden(false);
                                block.deferredRenderPending_ = false;
                            }
                        }
                    }, 1);
                }
            }

            this.queueIntersectionCheck();
        };

        const originalTranslate = workspaceProto.translate;
        workspaceProto.translate = function (x, y) {
            originalTranslate.call(this, x, y);
            if (this.grid_) {
                this.grid_.moveTo(x, y);
            }
        };

        workspaceProto.ensureTopBlockRendered_ = function (block) {
            if (block.deferredRenderPending_) {
                block.render(false);
                block.deferredRenderPending_ = false;
                this.resizeContents();
                if (!this.isFlyout) {
                    setTimeout(() => {
                        if (block.workspace) {
                            block.setConnectionsHidden(false);
                        }
                    }, 1);
                }
                return;
            }
            if (!block.rendered) {
                block.render(false);
            }
        };

        workspaceProto.renderVisibleTopBlocks = function () {
            for (const block of this.getTopBlocks(false)) {
                if (this.isBlockInViewport_ && this.isBlockInViewport_(block)) {
                    this.ensureTopBlockRendered_(block);
                }
            }
        };

        workspaceProto.queueIntersectionCheck = function () {
            if (!this.offscreenTopBlockCullingEnabled_) return;
            if (this.isDragSurfaceActive_ || (this.isDragging && this.isDragging())) {
                this.intersectionCheckPendingAfterDrag_ = true;
                return;
            }
            if (this.renderVisibleTopBlocks) {
                this.renderVisibleTopBlocks();
            }
            if (this.intersectionObserver) {
                this.intersectionObserver.queueIntersectionCheck();
            }
        };

        workspaceProto.scheduleWheelScroll_ = function (deltaX, deltaY) {
            if (!this.pendingWheelScrollDelta_) {
                this.pendingWheelScrollDelta_ = new ScratchBlocks.goog.math.Coordinate(0, 0);
            }
            this.pendingWheelScrollDelta_.x += deltaX;
            this.pendingWheelScrollDelta_.y += deltaY;
            this.scheduleWheelUpdate_();
        };

        workspaceProto.scheduleWheelZoom_ = function (x, y, delta) {
            this.pendingWheelZoomDelta_ += delta;
            this.pendingWheelZoomPosition_ = new ScratchBlocks.goog.math.Coordinate(x, y);
            this.scheduleWheelUpdate_();
        };

        workspaceProto.scheduleWheelUpdate_ = function () {
            if (this.pendingWheelFrame_ !== null) return;
            this.pendingWheelFrame_ = requestAnimationFrame(() => {
                this.pendingWheelFrame_ = null;
                this.flushWheelUpdate_();
            });
        };

        workspaceProto.flushWheelUpdate_ = function () {
            if (this.pendingWheelZoomDelta_ && this.pendingWheelZoomPosition_) {
                const zoomDelta = this.pendingWheelZoomDelta_;
                const zoomPosition = this.pendingWheelZoomPosition_;
                this.pendingWheelZoomDelta_ = 0;
                this.pendingWheelZoomPosition_ = null;
                this.deferGridUpdate_ = true;
                this.zoom(zoomPosition.x, zoomPosition.y, zoomDelta);
                this.deferGridUpdate_ = false;
                this.scheduleDeferredGridUpdate_();
            }

            if (this.pendingWheelScrollDelta_) {
                const scrollDelta = this.pendingWheelScrollDelta_;
                this.pendingWheelScrollDelta_ = null;
                this.startDragMetrics = this.getMetrics();
                this.scroll(this.scrollX - scrollDelta.x, this.scrollY - scrollDelta.y);
            }
        };

        workspaceProto.scheduleDeferredGridUpdate_ = function () {
            if (!this.grid_) return;
            if (this.pendingGridUpdateTimer_ !== null) {
                clearTimeout(this.pendingGridUpdateTimer_);
            }
            this.pendingGridUpdateTimer_ = setTimeout(() => {
                this.pendingGridUpdateTimer_ = null;
                if (this.grid_) {
                    this.grid_.update(this.scale);
                    const metrics = this.getMetrics ? this.getMetrics() : null;
                    const absoluteLeft = metrics && typeof metrics.absoluteLeft === 'number' ? metrics.absoluteLeft : 0;
                    const absoluteTop = metrics && typeof metrics.absoluteTop === 'number' ? metrics.absoluteTop : 0;
                    this.grid_.moveTo((this.scrollX || 0) + absoluteLeft, (this.scrollY || 0) + absoluteTop);
                }
            }, 80);
        };

        workspaceProto.onMouseWheel_ = function (e) {
            if (this.currentGesture_) {
                this.currentGesture_.cancel();
            }

            const multiplier = e.deltaMode === 0x1 ? ScratchBlocks.LINE_SCROLL_MULTIPLIER : 1;
            if (e.ctrlKey) {
                const delta = (-e.deltaY / 50) * multiplier;
                const position = ScratchBlocks.utils.mouseToSvg(
                    e,
                    this.getParentSvg(),
                    this.getInverseScreenCTM()
                );
                this.scheduleWheelZoom_(position.x, position.y, delta);
            } else {
                ScratchBlocks.WidgetDiv.hide(true);
                ScratchBlocks.DropDownDiv.hideWithoutAnimation();

                let deltaX = e.deltaX * multiplier;
                let deltaY = e.deltaY * multiplier;
                if (e.shiftKey && e.deltaX === 0) {
                    deltaX = e.deltaY * multiplier;
                    deltaY = 0;
                }
                this.scheduleWheelScroll_(deltaX, deltaY);
            }
            e.preventDefault();
        };

        workspaceProto.setScale = function (newScale) {
            if (this.options.zoomOptions.maxScale && newScale > this.options.zoomOptions.maxScale) {
                newScale = this.options.zoomOptions.maxScale;
            } else if (this.options.zoomOptions.minScale && newScale < this.options.zoomOptions.minScale) {
                newScale = this.options.zoomOptions.minScale;
            }
            this.scale = newScale;
            if (this.grid_) {
                if (this.deferGridUpdate_) {
                    this.scheduleDeferredGridUpdate_();
                } else {
                    this.grid_.update(this.scale);
                }
            }
            if (this.scrollbar) {
                this.scrollbar.resize();
            } else {
                this.translate(this.scrollX, this.scrollY);
            }
            ScratchBlocks.hideChaff(false);
            if (this.flyout_) {
                this.flyout_.reflow();
            }
            this.queueIntersectionCheck();
        };

        const originalWorkspaceDispose = workspaceProto.dispose;
        workspaceProto.dispose = function () {
            if (this.pendingWheelFrame_ !== null) {
                cancelAnimationFrame(this.pendingWheelFrame_);
                this.pendingWheelFrame_ = null;
            }
            if (this.pendingGridUpdateTimer_ !== null) {
                clearTimeout(this.pendingGridUpdateTimer_);
                this.pendingGridUpdateTimer_ = null;
            }
            originalWorkspaceDispose.call(this);
        };

        const originalResetDragSurface = workspaceProto.resetDragSurface;
        workspaceProto.resetDragSurface = function () {
            originalResetDragSurface.call(this);
            if (this.intersectionCheckPendingAfterDrag_) {
                this.intersectionCheckPendingAfterDrag_ = false;
                this.queueIntersectionCheck();
            }
        };
    }

    if (intersectionProto) {
        const originalIntersectionDispose = intersectionProto.dispose;
        intersectionProto.dispose = function () {
            if (this.intersectionCheckFrame_ !== null && this.intersectionCheckFrame_ !== undefined) {
                cancelAnimationFrame(this.intersectionCheckFrame_);
                this.intersectionCheckFrame_ = null;
            }
            originalIntersectionDispose.call(this);
        };

        intersectionProto.queueIntersectionCheck = function () {
            if (this.intersectionCheckQueued) return;
            this.intersectionCheckQueued = true;
            if (window.requestAnimationFrame) {
                this.intersectionCheckFrame_ = window.requestAnimationFrame(this.checkForIntersections);
            } else {
                this.intersectionCheckFrame_ = setTimeout(this.checkForIntersections, 16);
            }
        };

        const originalIntersectionCheck = intersectionProto.checkForIntersections;
        intersectionProto.checkForIntersections = function () {
            this.intersectionCheckQueued = false;
            this.intersectionCheckFrame_ = null;
            originalIntersectionCheck.call(this);
        };
    }

    if (draggerProto) {
        const originalDraggerDispose = draggerProto.dispose;
        draggerProto.dispose = function () {
            if (this.pendingDragFrame_ !== null && this.pendingDragFrame_ !== undefined) {
                cancelAnimationFrame(this.pendingDragFrame_);
                this.pendingDragFrame_ = null;
            }
            this.pendingScrollUpdate_ = null;
            originalDraggerDispose.call(this);
        };

        draggerProto.endDrag = function (currentDragDeltaXY) {
            this.drag(currentDragDeltaXY);
            this.flushDrag_();
            this.workspace_.resetDragSurface();
        };

        draggerProto.updateScroll_ = function (x, y) {
            this.pendingScrollUpdate_ = {x, y};
            if (this.pendingDragFrame_ !== null && this.pendingDragFrame_ !== undefined) {
                return;
            }
            this.pendingDragFrame_ = requestAnimationFrame(this.flushDrag_.bind(this));
        };

        draggerProto.flushDrag_ = function () {
            if (!this.workspace_ || !this.pendingScrollUpdate_) {
                this.pendingDragFrame_ = null;
                return;
            }

            const update = this.pendingScrollUpdate_;
            const metrics = this.startDragMetrics_;
            const workspace = this.workspace_;
            this.pendingScrollUpdate_ = null;
            this.pendingDragFrame_ = null;

            workspace.scrollX = -update.x - metrics.contentLeft;
            workspace.scrollY = -update.y - metrics.contentTop;

            const translatedX = workspace.scrollX + metrics.absoluteLeft;
            const translatedY = workspace.scrollY + metrics.absoluteTop;
            workspace.translate(translatedX, translatedY);
            if (workspace.grid_) {
                workspace.grid_.moveTo(translatedX, translatedY);
            }

            if (workspace.scrollbar) {
                workspace.scrollbar.hScroll.setHandlePosition(update.x * workspace.scrollbar.hScroll.ratio_);
                workspace.scrollbar.vScroll.setHandlePosition(update.y * workspace.scrollbar.vScroll.ratio_);
            }
        };
    }

    if (blockProto) {
        const originalInitSvg = blockProto.initSvg;
        blockProto.initSvg = function () {
            originalInitSvg.call(this);
            if (this.updateIntersectionObserver) {
                this.updateIntersectionObserver();
            }
        };
    }

    const originalClearWorkspaceAndLoadFromXml = ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml;
    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml = function (xml, workspace) {
        const deferBlockRendering = !!(
            workspace.rendered &&
            workspace.setOffscreenTopBlockCullingEnabled &&
            workspace.offscreenTopBlockCullingEnabled_
        );
        if (deferBlockRendering) {
            workspace.deferBlockRendering_ = true;
        }
        const blockIds = originalClearWorkspaceAndLoadFromXml(xml, workspace);
        if (deferBlockRendering) {
            workspace.deferBlockRendering_ = false;
            if (workspace.renderVisibleTopBlocks) {
                workspace.renderVisibleTopBlocks();
            }
            if (workspace.queueIntersectionCheck) {
                workspace.queueIntersectionCheck();
            }
        }
        return blockIds;
    };

    ScratchBlocks.Xml.domToBlock = function (xmlBlock, workspace) {
        if (xmlBlock instanceof ScratchBlocks.Workspace) {
            const swap = xmlBlock;
            xmlBlock = workspace;
            workspace = swap;
            console.warn('Deprecated call to Blockly.Xml.domToBlock, swap the arguments.');
        }
        ScratchBlocks.Events.disable();
        const variablesBeforeCreation = workspace.getAllVariables();
        let topBlock;
        try {
            topBlock = ScratchBlocks.Xml.domToBlockHeadless_(xmlBlock, workspace);
            const blocks = topBlock.getDescendants(false);
            const deferBlockRendering = !!workspace.deferBlockRendering_;
            if (workspace.rendered) {
                topBlock.setConnectionsHidden(true);
                for (let i = blocks.length - 1; i >= 0; i--) {
                    blocks[i].initSvg();
                }
                if (!deferBlockRendering) {
                    for (let i = blocks.length - 1; i >= 0; i--) {
                        blocks[i].render(false);
                    }
                    if (!workspace.isFlyout) {
                        setTimeout(() => {
                            if (topBlock.workspace) {
                                topBlock.setConnectionsHidden(false);
                            }
                        }, 1);
                    }
                    workspace.resizeContents();
                } else {
                    topBlock.deferredRenderPending_ = true;
                }
                topBlock.updateDisabled();
            } else {
                for (let i = blocks.length - 1; i >= 0; i--) {
                    blocks[i].initModel();
                }
            }
        } finally {
            ScratchBlocks.Events.enable();
        }
        if (ScratchBlocks.Events.isEnabled()) {
            const newVariables = ScratchBlocks.Variables.getAddedVariables(workspace, variablesBeforeCreation);
            for (const variable of newVariables) {
                ScratchBlocks.Events.fire(new ScratchBlocks.Events.VarCreate(variable));
            }
            ScratchBlocks.Events.fire(new ScratchBlocks.Events.BlockCreate(topBlock));
        }
        return topBlock;
    };
};

/**
 * Connect scratch blocks with the vm
 * @param {VirtualMachine} vm - The scratch vm
 * @return {ScratchBlocks} ScratchBlocks connected with the vm
 */
export default function (vm) {
    const ScratchBlocks = LazyScratchBlocks.get();
    applyScratchBlocksPerformancePatches(ScratchBlocks);
    const jsonForMenuBlock = function (name, menuOptionsFn, colors, start) {
        return {
            message0: '%1',
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            inputsInline: true,
            output: 'String',
            colour: colors.secondary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const jsonForHatBlockMenu = function (hatName, name, menuOptionsFn, colors, start) {
        return {
            message0: hatName,
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            colour: colors.primary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            extensions: ['shape_hat']
        };
    };


    const jsonForSensingMenus = function (menuOptionsFn) {
        return {
            message0: ScratchBlocks.Msg.SENSING_OF,
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PROPERTY',
                    options: function () {
                        return menuOptionsFn();
                    }

                },
                {
                    type: 'input_value',
                    name: 'OBJECT'
                }
            ],
            output: true,
            colour: ScratchBlocks.Colours.sensing.primary,
            colourSecondary: ScratchBlocks.Colours.sensing.secondary,
            colourTertiary: ScratchBlocks.Colours.sensing.tertiary,
            colourQuaternary: ScratchBlocks.Colours.sensing.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const soundsMenu = function () {
        let menu = [['', '']];
        if (vm.editingTarget && vm.editingTarget.sprite.sounds.length > 0) {
            menu = vm.editingTarget.sprite.sounds.map(sound => [sound.name, sound.name]);
        }
        menu.push([
            ScratchBlocks.ScratchMsgs.translate('SOUND_RECORD', 'record...'),
            ScratchBlocks.recordSoundCallback
        ]);
        return menu;
    };

    const costumesMenu = function () {
        if (vm.editingTarget && vm.editingTarget.getCostumes().length > 0) {
            return vm.editingTarget.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const backdropsMenu = function () {
        const next = ScratchBlocks.ScratchMsgs.translate('LOOKS_NEXTBACKDROP', 'next backdrop');
        const previous = ScratchBlocks.ScratchMsgs.translate('LOOKS_PREVIOUSBACKDROP', 'previous backdrop');
        const random = ScratchBlocks.ScratchMsgs.translate('LOOKS_RANDOMBACKDROP', 'random backdrop');
        if (vm.runtime.targets[0] && vm.runtime.targets[0].getCostumes().length > 0) {
            return vm.runtime.targets[0].getCostumes().map(costume => [costume.name, costume.name])
                .concat([[next, 'next backdrop'],
                    [previous, 'previous backdrop'],
                    [random, 'random backdrop']]);
        }
        return [['', '']];
    };

    const backdropNamesMenu = function () {
        const stage = vm.runtime.getTargetForStage();
        if (stage && stage.getCostumes().length > 0) {
            return stage.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const spriteMenu = function () {
        const sprites = [];
        for (const targetId in vm.runtime.targets) {
            if (!Object.prototype.hasOwnProperty.call(vm.runtime.targets, targetId)) continue;
            if (vm.runtime.targets[targetId].isOriginal) {
                if (!vm.runtime.targets[targetId].isStage) {
                    if (vm.runtime.targets[targetId] === vm.editingTarget) {
                        continue;
                    }
                    sprites.push([vm.runtime.targets[targetId].sprite.name, vm.runtime.targets[targetId].sprite.name]);
                }
            }
        }
        return sprites;
    };

    const cloneMenu = function () {
        if (vm.editingTarget && vm.editingTarget.isStage) {
            const menu = spriteMenu();
            if (menu.length === 0) {
                return [['', '']]; // Empty menu matches Scratch 2 behavior
            }
            return menu;
        }
        const myself = ScratchBlocks.ScratchMsgs.translate('CONTROL_CREATECLONEOF_MYSELF', 'myself');
        return [[myself, '_myself_']].concat(spriteMenu());
    };

    const soundColors = ScratchBlocks.Colours.sounds;

    const looksColors = ScratchBlocks.Colours.looks;

    const motionColors = ScratchBlocks.Colours.motion;

    const sensingColors = ScratchBlocks.Colours.sensing;

    const controlColors = ScratchBlocks.Colours.control;

    const eventColors = ScratchBlocks.Colours.event;

    ScratchBlocks.Blocks.sound_sounds_menu.init = function () {
        const json = jsonForMenuBlock('SOUND_MENU', soundsMenu, soundColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.looks_costume.init = function () {
        const json = jsonForMenuBlock('COSTUME', costumesMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.looks_backdrops.init = function () {
        const json = jsonForMenuBlock('BACKDROP', backdropsMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.event_whenbackdropswitchesto.init = function () {
        const json = jsonForHatBlockMenu(
            ScratchBlocks.Msg.EVENT_WHENBACKDROPSWITCHESTO,
            'BACKDROP', backdropNamesMenu, eventColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_pointtowards_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_POINTTOWARDS_RANDOM', 'random direction');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_POINTTOWARDS_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TOWARDS', spriteMenu, motionColors, [
            [mouse, '_mouse_'],
            [random, '_random_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_goto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_glideto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of_object_menu.init = function () {
        const stage = ScratchBlocks.ScratchMsgs.translate('SENSING_OF_STAGE', 'Stage');
        const json = jsonForMenuBlock('OBJECT', spriteMenu, sensingColors, [
            [stage, '_stage_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of.init = function () {
        const blockId = this.id;
        const blockType = this.type;

        // Get the sensing_of block from vm.
        let defaultSensingOfBlock;
        const blocks = vm.runtime.flyoutBlocks._blocks;
        Object.keys(blocks).forEach(id => {
            const block = blocks[id];
            if (id === blockType || (block && block.opcode === blockType)) {
                defaultSensingOfBlock = block;
            }
        });

        // Function that fills in menu for the first input in the sensing block.
        // Called every time it opens since it depends on the values in the other block input.
        const menuFn = function () {
            const stageOptions = [
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNUMBER, 'backdrop #'],
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNAME, 'backdrop name'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const spriteOptions = [
                [ScratchBlocks.Msg.SENSING_OF_XPOSITION, 'x position'],
                [ScratchBlocks.Msg.SENSING_OF_YPOSITION, 'y position'],
                [ScratchBlocks.Msg.SENSING_OF_DIRECTION, 'direction'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENUMBER, 'costume #'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENAME, 'costume name'],
                [ScratchBlocks.Msg.SENSING_OF_SIZE, 'size'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            if (vm.editingTarget) {
                let lookupBlocks = vm.editingTarget.blocks;
                let sensingOfBlock = lookupBlocks.getBlock(blockId);

                // The block doesn't exist, but should be in the flyout. Look there.
                if (!sensingOfBlock) {
                    sensingOfBlock = vm.runtime.flyoutBlocks.getBlock(blockId) || defaultSensingOfBlock;
                    // If we still don't have a block, just return an empty list . This happens during
                    // scratch blocks construction.
                    if (!sensingOfBlock) {
                        return [['', '']];
                    }
                    // The block was in the flyout so look up future block info there.
                    lookupBlocks = vm.runtime.flyoutBlocks;
                }
                const sort = function (options) {
                    options.sort(ScratchBlocks.scratchBlocksUtils.compareStrings);
                };
                // Get all the stage variables (no lists) so we can add them to menu when the stage is selected.
                const stageVariableOptions = vm.runtime.getTargetForStage().getAllVariableNamesInScopeByType('');
                sort(stageVariableOptions);
                const stageVariableMenuItems = stageVariableOptions.map(variable => [variable, variable]);
                if (sensingOfBlock.inputs.OBJECT.shadow !== sensingOfBlock.inputs.OBJECT.block) {
                    // There's a block dropped on top of the menu. It'd be nice to evaluate it and
                    // return the correct list, but that is tricky. Scratch2 just returns stage options
                    // so just do that here too.
                    return stageOptions.concat(stageVariableMenuItems);
                }
                const menuBlock = lookupBlocks.getBlock(sensingOfBlock.inputs.OBJECT.shadow);
                const selectedItem = menuBlock.fields.OBJECT.value;
                if (selectedItem === '_stage_') {
                    return stageOptions.concat(stageVariableMenuItems);
                }
                // Get all the local variables (no lists) and add them to the menu.
                const target = vm.runtime.getSpriteTargetByName(selectedItem);
                let spriteVariableOptions = [];
                // The target should exist, but there are ways for it not to (e.g. #4203).
                if (target) {
                    spriteVariableOptions = target.getAllVariableNamesInScopeByType('', true);
                    sort(spriteVariableOptions);
                }
                const spriteVariableMenuItems = spriteVariableOptions.map(variable => [variable, variable]);
                return spriteOptions.concat(spriteVariableMenuItems);
            }
            return [['', '']];
        };

        const json = jsonForSensingMenus(menuFn);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_distancetomenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_DISTANCETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('DISTANCETOMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_touchingobjectmenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_POINTER', 'mouse-pointer');
        const edge = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_EDGE', 'edge');
        const json = jsonForMenuBlock('TOUCHINGOBJECTMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_'],
            [edge, '_edge_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.control_create_clone_of_menu.init = function () {
        const json = jsonForMenuBlock('CLONE_OPTION', cloneMenu, controlColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.VerticalFlyout.getCheckboxState = function (blockId) {
        const monitoredBlock = vm.runtime.monitorBlocks._blocks[blockId];
        return monitoredBlock ? monitoredBlock.isMonitored : false;
    };

    ScratchBlocks.FlyoutExtensionCategoryHeader.getExtensionState = function (extensionId) {
        if (vm.getPeripheralIsConnected(extensionId)) {
            return ScratchBlocks.StatusButtonState.READY;
        }
        return ScratchBlocks.StatusButtonState.NOT_READY;
    };

    ScratchBlocks.FieldNote.playNote_ = function (noteNum, extensionId) {
        vm.runtime.emit('PLAY_NOTE', noteNum, extensionId);
    };

    // Use a collator's compare instead of localeCompare which internally
    // creates a collator. Using this is a lot faster in browsers that create a
    // collator for every localeCompare call.
    const collator = new Intl.Collator([], {
        sensitivity: 'base',
        numeric: true
    });
    ScratchBlocks.scratchBlocksUtils.compareStrings = function (str1, str2) {
        return collator.compare(str1, str2);
    };

    // Blocks wants to know if 3D CSS transforms are supported. The cross
    // section of browsers Scratch supports and browsers that support 3D CSS
    // transforms will make the return always true.
    //
    // Shortcutting to true lets us skip an expensive style recalculation when
    // first loading the Scratch editor.
    ScratchBlocks.utils.is3dSupported = function () {
        return true;
    };

    return ScratchBlocks;
}
