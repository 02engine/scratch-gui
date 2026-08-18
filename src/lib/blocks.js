import LazyScratchBlocks from './tw-lazy-scratch-blocks';

const applyScratchBlocksPerformancePatches = ScratchBlocks => {
    if (!ScratchBlocks || ScratchBlocks.__twPerformancePatchesApplied) {
        return;
    }
    ScratchBlocks.__twPerformancePatchesApplied = true;

    const workspaceProto = ScratchBlocks.WorkspaceSvg && ScratchBlocks.WorkspaceSvg.prototype;
    const draggerProto = ScratchBlocks.WorkspaceDragger && ScratchBlocks.WorkspaceDragger.prototype;
    const blockProto = ScratchBlocks.BlockSvg && ScratchBlocks.BlockSvg.prototype;
    const flyoutProto = ScratchBlocks.Flyout && ScratchBlocks.Flyout.prototype;
    const deferredIntersectionCheckDelay = ScratchBlocks.__twOffscreenCullingScreenMargin ? 0 : 120;

    const clearIntersectionObserver = workspace => {
        const observer = workspace && workspace.intersectionObserver;
        if (!observer) return;
        if (observer.intersectionCheckFrame_ !== null && observer.intersectionCheckFrame_ !== undefined) {
            cancelAnimationFrame(observer.intersectionCheckFrame_);
            observer.intersectionCheckFrame_ = null;
        }
        observer.intersectionCheckQueued = false;
        observer.observing = [];
        workspace.intersectionCheckPendingAfterDrag_ = false;
    };

    const observeTopBlocks = workspace => {
        if (!workspace || !workspace.intersectionObserver || typeof workspace.getTopBlocks !== 'function') return;
        const topBlocks = workspace.getTopBlocks(false);
        for (let i = 0; i < topBlocks.length; i++) {
            const block = topBlocks[i];
            if (block && typeof block.updateIntersectionObserver === 'function') {
                block.updateIntersectionObserver();
            }
        }
    };

    if (workspaceProto) {
        workspaceProto.pendingWheelFrame_ = null;
        workspaceProto.pendingWheelScrollDelta_ = null;
        workspaceProto.pendingWheelZoomDelta_ = 0;
        workspaceProto.pendingWheelZoomPosition_ = null;
        workspaceProto.pendingGridUpdateTimer_ = null;
        workspaceProto.pendingScrollbarResizeTimer_ = null;
        workspaceProto.pendingFlyoutReflowTimer_ = null;
        workspaceProto.pendingIntersectionCheckTimer_ = null;
        workspaceProto.deferGridUpdate_ = false;
        workspaceProto.deferIntersectionChecks_ = false;

        const originalTranslate = workspaceProto.translate;
        const originalOnMouseWheel = workspaceProto.onMouseWheel_;
        const originalSetScale = workspaceProto.setScale;
        const originalQueueIntersectionCheck = workspaceProto.queueIntersectionCheck;
        const originalSetOffscreenTopBlockCullingEnabled = workspaceProto.setOffscreenTopBlockCullingEnabled;
        workspaceProto.queueIntersectionCheck = function () {
            if (!this.offscreenTopBlockCullingEnabled_) {
                return;
            }
            if (this.deferIntersectionChecks_) {
                this.scheduleDeferredIntersectionCheck_();
                return;
            }
            if (typeof originalQueueIntersectionCheck === 'function') {
                return originalQueueIntersectionCheck.call(this);
            }
        };

        workspaceProto.setOffscreenTopBlockCullingEnabled = function (enabled) {
            if (typeof originalSetOffscreenTopBlockCullingEnabled === 'function') {
                originalSetOffscreenTopBlockCullingEnabled.call(this, enabled);
            } else {
                this.offscreenTopBlockCullingEnabled_ = enabled;
            }

            if (!enabled) {
                clearIntersectionObserver(this);
                const topBlocks = typeof this.getTopBlocks === 'function' ? this.getTopBlocks(false) : [];
                for (let i = 0; i < topBlocks.length; i++) {
                    const block = topBlocks[i];
                    if (block && block.intersects_ === false && typeof block.setIntersects === 'function') {
                        block.setIntersects(true);
                    }
                }
            } else {
                observeTopBlocks(this);
                this.queueIntersectionCheck();
            }
        };

        workspaceProto.translate = function (x, y) {
            originalTranslate.call(this, x, y);
            if (!this.isFlyout && this.grid_) {
                this.grid_.moveTo(x, y);
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
            // A physical wheel event should have the same one-step effect as
            // a zoom button click. Browser deltaY values commonly represent
            // more than one button step, so callers normalize them before
            // they reach this queue. Keep the queue signed and bounded so a
            // burst delivered in one frame cannot turn one gesture into a
            // multi-step jump.
            this.pendingWheelZoomDelta_ = Math.max(-1, Math.min(1,
                this.pendingWheelZoomDelta_ + (delta > 0 ? 1 : delta < 0 ? -1 : 0)));
            // Apply a burst of wheel events around one stable anchor.
            if (!this.pendingWheelZoomPosition_) {
                this.pendingWheelZoomPosition_ = new ScratchBlocks.goog.math.Coordinate(x, y);
            }
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
            this.deferIntersectionChecks_ = true;
            try {
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
                    // Canvas layout can change the content bounds while a
                    // wheel gesture is in progress. Refresh the scrollbar's
                    // ratio before converting the requested pixel delta to a
                    // workspace position; otherwise the ratio from the
                    // previous content height can make scrolling slow down or
                    // appear to reverse when a large C block finishes.
                    if (this.scrollbar && typeof this.scrollbar.resize === 'function') {
                        this.scrollbar.resize();
                    }
                    this.startDragMetrics = this.getMetrics();
                    this.scroll(this.scrollX - scrollDelta.x, this.scrollY - scrollDelta.y);
                }
            } finally {
                this.deferGridUpdate_ = false;
                this.deferIntersectionChecks_ = false;
                this.scheduleDeferredIntersectionCheck_();
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

        workspaceProto.scheduleDeferredScrollbarResize_ = function () {
            if (!this.scrollbar) return;
            if (this.pendingScrollbarResizeTimer_ !== null) {
                clearTimeout(this.pendingScrollbarResizeTimer_);
            }
            this.pendingScrollbarResizeTimer_ = setTimeout(() => {
                this.pendingScrollbarResizeTimer_ = null;
                if (this.scrollbar) {
                    this.scrollbar.resize();
                }
            }, 80);
        };

        workspaceProto.scheduleDeferredFlyoutReflow_ = function () {
            if (!this.flyout_) return;
            if (this.pendingFlyoutReflowTimer_ !== null) {
                clearTimeout(this.pendingFlyoutReflowTimer_);
            }
            this.pendingFlyoutReflowTimer_ = setTimeout(() => {
                this.pendingFlyoutReflowTimer_ = null;
                if (this.flyout_) {
                    this.flyout_.reflow();
                }
            }, 80);
        };

        workspaceProto.scheduleDeferredIntersectionCheck_ = function () {
            if (!this.offscreenTopBlockCullingEnabled_) return;
            if (this.pendingIntersectionCheckTimer_ !== null) {
                clearTimeout(this.pendingIntersectionCheckTimer_);
            }
            this.pendingIntersectionCheckTimer_ = setTimeout(() => {
                this.pendingIntersectionCheckTimer_ = null;
                if (!this.offscreenTopBlockCullingEnabled_) return;
                if (typeof originalQueueIntersectionCheck === 'function') {
                    originalQueueIntersectionCheck.call(this);
                }
            }, deferredIntersectionCheckDelay);
        };

        workspaceProto.onMouseWheel_ = function (e) {
            if (this.currentGesture_) {
                this.currentGesture_.cancel();
            }

            const multiplier = e.deltaMode === 0x1 ? ScratchBlocks.LINE_SCROLL_MULTIPLIER : 1;
            if (e.ctrlKey && !this.isFlyout) {
                // Match zoomCenter(+/-1): one wheel event means one zoom step.
                // Do not scale this by the browser's pixel delta because a
                // single event may contain 50, 100 or high-resolution values.
                const delta = e.deltaY === 0 ? 0 : (e.deltaY < 0 ? 1 : -1);
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
            if (this.isFlyout && typeof originalSetScale === 'function') {
                return originalSetScale.call(this, newScale);
            }
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
                if (this.deferGridUpdate_) {
                    this.scheduleDeferredScrollbarResize_();
                } else {
                    this.scrollbar.resize();
                }
            } else {
                this.translate(this.scrollX, this.scrollY);
            }
            ScratchBlocks.hideChaff(false);
            if (this.flyout_) {
                if (this.deferGridUpdate_) {
                    this.scheduleDeferredFlyoutReflow_();
                } else {
                    this.flyout_.reflow();
                }
            }
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
            if (this.pendingScrollbarResizeTimer_ !== null) {
                clearTimeout(this.pendingScrollbarResizeTimer_);
                this.pendingScrollbarResizeTimer_ = null;
            }
            if (this.pendingFlyoutReflowTimer_ !== null) {
                clearTimeout(this.pendingFlyoutReflowTimer_);
                this.pendingFlyoutReflowTimer_ = null;
            }
            if (this.pendingIntersectionCheckTimer_ !== null) {
                clearTimeout(this.pendingIntersectionCheckTimer_);
                this.pendingIntersectionCheckTimer_ = null;
            }
            originalWorkspaceDispose.call(this);
        };

    }

    if (flyoutProto) {
        const originalFlyoutShow = flyoutProto.show;
        flyoutProto.show = function (xmlList) {
            const workspace = this.workspace_;
            const restoreCulling = !!(
                workspace &&
                workspace.offscreenTopBlockCullingEnabled_ &&
                typeof workspace.setOffscreenTopBlockCullingEnabled === 'function'
            );

            if (restoreCulling) {
                workspace.setOffscreenTopBlockCullingEnabled(false);
            }

            try {
                return originalFlyoutShow.call(this, xmlList);
            } finally {
                if (restoreCulling && workspace) {
                    workspace.setOffscreenTopBlockCullingEnabled(true);
                    if (typeof workspace.renderVisibleTopBlocks === 'function') {
                        workspace.renderVisibleTopBlocks();
                    }
                    if (typeof workspace.queueIntersectionCheck === 'function') {
                        workspace.queueIntersectionCheck();
                    }
                }
            }
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

            workspace.deferIntersectionChecks_ = true;
            try {
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
            } finally {
                workspace.deferIntersectionChecks_ = false;
                if (workspace.scheduleDeferredIntersectionCheck_) {
                    workspace.scheduleDeferredIntersectionCheck_();
                }
            }
        };
    }

    if (blockProto) {
        const originalUpdateIntersectionObserver = blockProto.updateIntersectionObserver;
        blockProto.updateIntersectionObserver = function () {
            if (!this.workspace || !this.workspace.offscreenTopBlockCullingEnabled_) {
                if (this.intersects_ === false && typeof this.setIntersects === 'function') {
                    this.setIntersects(true);
                }
                return;
            }
            if (typeof originalUpdateIntersectionObserver === 'function') {
                return originalUpdateIntersectionObserver.call(this);
            }
        };
    }

    const originalClearWorkspaceAndLoadFromXml = ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml;
    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml = function (xml, workspace) {
        workspace.asyncXmlLoadToken_ = (workspace.asyncXmlLoadToken_ || 0) + 1;
        workspace.deferBlockRendering_ = false;
        workspace.deferSvgInitialization_ = false;
        const deferBlockRendering = !!(
            workspace.rendered &&
            workspace.setOffscreenTopBlockCullingEnabled &&
            workspace.offscreenTopBlockCullingEnabled_
        );
        if (deferBlockRendering) {
            workspace.deferBlockRendering_ = true;
        }
        let blockIds;
        try {
            blockIds = originalClearWorkspaceAndLoadFromXml(xml, workspace);
        } finally {
            workspace.deferBlockRendering_ = false;
            workspace.deferSvgInitialization_ = false;
        }
        if (deferBlockRendering) {
            if (workspace.renderVisibleTopBlocks) {
                workspace.renderVisibleTopBlocks();
            }
            if (workspace.queueIntersectionCheck) {
                workspace.queueIntersectionCheck();
            }
        }
        return blockIds;
    };

    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXmlAsync = function (xml, workspace, isCancelled = () => false) {
        const loadToken = (workspace.asyncXmlLoadToken_ || 0) + 1;
        workspace.asyncXmlLoadToken_ = loadToken;

        const ownsWorkspace = () => workspace.asyncXmlLoadToken_ === loadToken;
        const cancelled = () => !ownsWorkspace() || isCancelled() || !workspace.rendered;
        const nextFrame = callback => requestAnimationFrame(() => setTimeout(callback, 0));
        const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
        const getPosition = element => ({
            x: Number.parseInt(element.getAttribute('x'), 10) || 10,
            y: Number.parseInt(element.getAttribute('y'), 10) || 10
        });
        const metrics = workspace.getMetrics ? workspace.getMetrics() : null;
        const viewport = metrics ? {
            left: -metrics.viewLeft,
            right: -metrics.viewLeft + metrics.viewWidth,
            top: -metrics.viewTop,
            bottom: -metrics.viewTop + metrics.viewHeight
        } : null;
        const distanceFromViewport = element => {
            if (!viewport) return 0;
            const position = getPosition(element);
            const dx = Math.max(viewport.left - position.x, 0, position.x - viewport.right);
            const dy = Math.max(viewport.top - position.y, 0, position.y - viewport.bottom);
            return (dx * dx) + (dy * dy);
        };

        const scripts = [];
        const variables = [];
        const comments = [];
        for (let i = 0; i < xml.childNodes.length; i++) {
            const child = xml.childNodes[i];
            const name = child.nodeName.toLowerCase();
            if (name === 'block' || (name === 'shadow' && !ScratchBlocks.Events.recordUndo)) {
                scripts.push({element: child, order: i, distance: distanceFromViewport(child)});
            } else if (name === 'variables') {
                variables.push(child);
            } else if (name === 'comment') {
                comments.push(child);
            }
        }
        scripts.sort((a, b) => (a.distance - b.distance) || (a.order - b.order));

        const setLoadFlags = enabled => {
            workspace.deferBlockRendering_ = enabled;
            workspace.deferSvgInitialization_ = enabled;
            workspace.setResizesEnabled(!enabled);
            workspace.setToolboxRefreshEnabled(!enabled);
        };
        const runWithoutEvents = callback => {
            ScratchBlocks.Events.disable();
            ScratchBlocks.Field.startCache();
            try {
                return callback();
            } finally {
                ScratchBlocks.Field.stopCache();
                ScratchBlocks.Events.enable();
            }
        };
        // Blockly's recursive importer cannot yield inside deeply nested
        // SUBSTACKs. This explicit stack preserves its order and connections.
        const createBlockFrame = (element, onComplete) => {
            const prototypeName = element.getAttribute('type');
            if (!prototypeName) {
                throw new Error(`Block type unspecified: ${element.outerHTML}`);
            }
            return {
                element,
                block: workspace.newBlock(prototypeName, element.getAttribute('id')),
                childIndex: 0,
                onComplete
            };
        };
        const completeBlockFrame = frame => {
            const {block, element} = frame;
            const inline = element.getAttribute('inline');
            if (inline) block.setInputsInline(inline === 'true');
            const disabled = element.getAttribute('disabled');
            if (disabled) block.setDisabled(disabled === 'true' || disabled === 'disabled');
            const deletable = element.getAttribute('deletable');
            if (deletable) block.setDeletable(deletable === 'true');
            const movable = element.getAttribute('movable');
            if (movable) block.setMovable(movable === 'true');
            const editable = element.getAttribute('editable');
            if (editable) block.setEditable(editable === 'true');
            const collapsed = element.getAttribute('collapsed');
            if (collapsed) block.setCollapsed(collapsed === 'true');
            if (element.nodeName.toLowerCase() === 'shadow') block.setShadow(true);
            frame.onComplete(block);
        };
        const processBlockFrame = task => {
            const frame = task.stack[task.stack.length - 1];
            if (frame.childIndex >= frame.element.childNodes.length) {
                task.stack.pop();
                completeBlockFrame(frame);
                return;
            }

            const element = frame.element.childNodes[frame.childIndex++];
            if (element.nodeType === 3) return;

            const {block} = frame;
            const elementName = element.nodeName.toLowerCase();
            const name = element.getAttribute('name');
            let childBlockElement = null;
            let childShadowElement = null;
            for (let i = 0; i < element.childNodes.length; i++) {
                const child = element.childNodes[i];
                if (child.nodeType !== 1) continue;
                const childName = child.nodeName.toLowerCase();
                if (childName === 'block') childBlockElement = child;
                if (childName === 'shadow') childShadowElement = child;
            }
            if (!childBlockElement && childShadowElement) childBlockElement = childShadowElement;

            if (elementName === 'mutation') {
                if (block.domToMutation) {
                    block.domToMutation(element);
                    if (block.initSvg) block.initSvg();
                }
                return;
            }
            if (elementName === 'comment') {
                const bubbleX = Number.parseInt(element.getAttribute('x'), 10);
                const bubbleY = Number.parseInt(element.getAttribute('y'), 10);
                block.setCommentText(
                    element.textContent,
                    element.getAttribute('id'),
                    bubbleX,
                    bubbleY,
                    (element.getAttribute('minimized') || false) === 'true'
                );
                const visible = element.getAttribute('pinned');
                if (workspace.canvasBlockRenderer && workspace.__02CanvasPendingComments) {
                    workspace.__02CanvasPendingComments.push({
                        block,
                        visible: visible ? visible === 'true' : true
                    });
                } else if (visible && !block.isInFlyout) {
                    setTimeout(() => {
                        if (block.comment && block.comment.setVisible) {
                            block.comment.setVisible(visible === 'true');
                        }
                    }, 1);
                }
                const bubbleWidth = Number.parseInt(element.getAttribute('w'), 10);
                const bubbleHeight = Number.parseInt(element.getAttribute('h'), 10);
                if (!Number.isNaN(bubbleWidth) && !Number.isNaN(bubbleHeight) &&
                    block.comment && block.comment.setVisible) {
                    if (block.comment instanceof ScratchBlocks.ScratchBlockComment) {
                        block.comment.setSize(bubbleWidth, bubbleHeight);
                    } else {
                        block.comment.setBubbleSize(bubbleWidth, bubbleHeight);
                    }
                }
                return;
            }
            if (elementName === 'data') {
                block.data = element.textContent;
                return;
            }
            if (elementName === 'title' || elementName === 'field') {
                ScratchBlocks.Xml.domToField_(block, name, element);
                return;
            }
            if (elementName === 'value' || elementName === 'statement') {
                const input = block.getInput(name);
                if (!input) {
                    console.warn(`Ignoring non-existent input ${name} in block ${block.type}`);
                    return;
                }
                if (childShadowElement) input.connection.setShadowDom(childShadowElement);
                if (childBlockElement) {
                    task.blockCount++;
                    task.stack.push(createBlockFrame(childBlockElement, childBlock => {
                        const connection = childBlock.outputConnection || childBlock.previousConnection;
                        if (!connection) throw new Error('Child block does not have an output or previous connection.');
                        input.connection.connect(connection);
                    }));
                }
                return;
            }
            if (elementName === 'next') {
                if (childShadowElement && block.nextConnection) {
                    block.nextConnection.setShadowDom(childShadowElement);
                }
                if (childBlockElement) {
                    if (!block.nextConnection || block.nextConnection.isConnected()) {
                        throw new Error(`Invalid next connection on block ${block.type}`);
                    }
                    task.blockCount++;
                    task.stack.push(createBlockFrame(childBlockElement, childBlock => {
                        if (!childBlock.previousConnection) {
                            throw new Error('Next block does not have a previous connection.');
                        }
                        block.nextConnection.connect(childBlock.previousConnection);
                    }));
                }
            }
        };
        const blockIds = [];
        const finish = wasCancelled => {
            if (ownsWorkspace()) {
                setLoadFlags(false);
                workspace.__02CanvasXmlLoading = false;
                if (wasCancelled) workspace.__02CanvasPendingComments = [];
                if (!wasCancelled && !workspace.canvasBlockRenderer) {
                    workspace.resizeContents();
                    if (workspace.renderVisibleTopBlocks) workspace.renderVisibleTopBlocks();
                    if (workspace.queueIntersectionCheck) workspace.queueIntersectionCheck();
                } else if (!wasCancelled && workspace.canvasBlockRenderer) {
                    workspace.canvasBlockRenderer.scheduleDraw();
                }
            }
            return {cancelled: wasCancelled, blockIds};
        };

        setLoadFlags(true);
        if (workspace.canvasBlockRenderer) {
            workspace.__02CanvasXmlLoading = true;
            workspace.__02CanvasPendingComments = [];
        }
        runWithoutEvents(() => {
            workspace.clear();
            for (const variableElement of variables) {
                ScratchBlocks.Xml.domToVariables(variableElement, workspace);
            }
            const width = workspace.RTL ? workspace.getWidth() : 0;
            for (const commentElement of comments) {
                if (workspace.rendered) {
                    ScratchBlocks.WorkspaceCommentSvg.fromXml(commentElement, workspace, width);
                } else {
                    ScratchBlocks.WorkspaceComment.fromXml(commentElement, workspace);
                }
            }
        });
        setLoadFlags(true);

        let index = 0;
        let blockTask = null;
        return new Promise((resolve, reject) => {
            const processSlice = () => {
                if (cancelled()) {
                    resolve(finish(true));
                    return;
                }

                const started = now();
                try {
                    runWithoutEvents(() => {
                        do {
                            if (!blockTask) {
                                if (index >= scripts.length) break;
                                const script = scripts[index++].element;
                                const nextBlockTask = {
                                    element: script,
                                    blockCount: 1,
                                    topBlock: null,
                                    stack: []
                                };
                                nextBlockTask.stack.push(createBlockFrame(script, block => {
                                    nextBlockTask.topBlock = block;
                                }));
                                blockTask = nextBlockTask;
                            }

                            processBlockFrame(blockTask);
                            if (blockTask.stack.length === 0) {
                                const {topBlock, element, blockCount} = blockTask;
                                const canvasWorkspace = !!workspace.canvasBlockRenderer;
                                topBlock.setConnectionsHidden(!canvasWorkspace);
                                topBlock.deferredRenderPending_ = !canvasWorkspace;
                                topBlock.deferredSvgInitPending_ = !canvasWorkspace;
                                topBlock.lazyEstimatedWidth_ = 1200;
                                topBlock.lazyEstimatedHeight_ = Math.max(
                                    160,
                                    blockCount * (canvasWorkspace ? 40 : 5)
                                );
                                const position = getPosition(element);
                                topBlock.translate(
                                    workspace.RTL ? workspace.getWidth() - position.x : position.x,
                                    position.y
                                );
                                if (topBlock.createLazySvgPlaceholder && !canvasWorkspace) {
                                    topBlock.createLazySvgPlaceholder();
                                }
                                topBlock.updateDisabled();
                                blockIds.push(topBlock.id);
                                blockTask = null;
                            }
                        } while (now() - started < 6 && !cancelled());
                    });
                } catch (error) {
                    finish(false);
                    reject(error);
                    return;
                }

                if (!workspace.canvasBlockRenderer && workspace.renderVisibleTopBlocks) {
                    workspace.renderVisibleTopBlocks();
                }
                if (!workspace.canvasBlockRenderer && workspace.queueIntersectionCheck) {
                    workspace.queueIntersectionCheck();
                }
                if (index >= scripts.length && !blockTask) {
                    resolve(finish(false));
                } else {
                    nextFrame(processSlice);
                }
            };
            nextFrame(processSlice);
        });
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
            const deferSvgInitialization = !!workspace.deferSvgInitialization_;
            if (workspace.rendered) {
                topBlock.setConnectionsHidden(true);
                if (!deferSvgInitialization) {
                    for (let i = blocks.length - 1; i >= 0; i--) {
                        blocks[i].initSvg();
                    }
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
                    if (!workspace.canvasBlockRenderer) workspace.resizeContents();
                } else {
                    topBlock.deferredRenderPending_ = true;
                    if (deferSvgInitialization) {
                        topBlock.deferredSvgInitPending_ = true;
                        topBlock.lazyEstimatedWidth_ = 1200;
                        topBlock.lazyEstimatedHeight_ = Math.max(160, blocks.length * 5);
                        if (topBlock.createLazySvgPlaceholder && !workspace.canvasBlockRenderer) {
                            topBlock.createLazySvgPlaceholder();
                        }
                    }
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
    if (vm && vm.runtime) {
        if (!ScratchBlocks.VERSION) {
            ScratchBlocks.VERSION = '0.1.0';
        }
        if (typeof vm.runtime.attachBlocks === 'function') {
            vm.runtime.attachBlocks(ScratchBlocks);
        } else if (!vm.runtime.scratchBlocks) {
            vm.runtime.scratchBlocks = ScratchBlocks;
        }
        vm.runtime.scratchBlocksVersion = ScratchBlocks.VERSION;
    }
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
