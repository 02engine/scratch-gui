let _ScratchBlocks = null;

const OFFSCREEN_CULLING_SCREEN_MARGIN = 240;

const patchOffscreenTopBlockCulling = ScratchBlocks => {
    if (ScratchBlocks.__twOffscreenTopBlockCullingPatched) {
        return;
    }
    ScratchBlocks.__twOffscreenTopBlockCullingPatched = true;
    ScratchBlocks.__twOffscreenCullingScreenMargin = OFFSCREEN_CULLING_SCREEN_MARGIN;

    const WorkspaceSvg = ScratchBlocks.WorkspaceSvg;
    if (WorkspaceSvg && WorkspaceSvg.prototype && WorkspaceSvg.prototype.isBlockInViewport_) {
        WorkspaceSvg.prototype.getLazyViewportBounds_ = function () {
            const parentSvg = this.getParentSvg && this.getParentSvg();
            const canvas = this.isDragSurfaceActive_ && this.workspaceDragSurface_ ?
                this.workspaceDragSurface_.SVG_ : this.getCanvas && this.getCanvas();
            if (!parentSvg || !canvas) {
                return null;
            }

            const scale = this.scale || 1;
            const canvasPos = ScratchBlocks.utils.getRelativeXY(canvas);
            const width = Number(parentSvg.width && parentSvg.width.baseVal && parentSvg.width.baseVal.value) ||
                parentSvg.clientWidth || 0;
            const height = Number(parentSvg.height && parentSvg.height.baseVal && parentSvg.height.baseVal.value) ||
                parentSvg.clientHeight || 0;
            const padding = OFFSCREEN_CULLING_SCREEN_MARGIN / scale;
            const left = (-canvasPos.x / scale) - padding;
            const right = ((width - canvasPos.x) / scale) + padding;
            const top = (-canvasPos.y / scale) - padding;
            const bottom = ((height - canvasPos.y) / scale) + padding;
            return {
                left,
                right,
                top,
                bottom,
                centerX: (left + right) / 2,
                centerY: (top + bottom) / 2
            };
        };

        WorkspaceSvg.prototype.isBlockInViewport_ = function (block, viewport) {
            const bounds = viewport || this.getLazyViewportBounds_();
            if (!bounds) {
                return true;
            }

            const rootBlock = typeof block.getRootBlock === 'function' ?
                block.getRootBlock() : block;
            const blockRect = typeof rootBlock.getScriptBoundingRectangle === 'function' ?
                rootBlock.getScriptBoundingRectangle() : rootBlock.getBoundingRectangle();
            return !(blockRect.bottomRight.x < bounds.left ||
                blockRect.topLeft.x > bounds.right ||
                blockRect.bottomRight.y < bounds.top ||
                blockRect.topLeft.y > bounds.bottom);
        };
    }

    const IntersectionObserver = ScratchBlocks.IntersectionObserver;
    if (IntersectionObserver && IntersectionObserver.prototype) {
        IntersectionObserver.prototype.checkForIntersections = function () {
            this.intersectionCheckQueued = false;
            this.intersectionCheckFrame_ = null;

            if (!this.workspace) {
                return;
            }

            const workspace = this.workspace;
            const workspaceScale = workspace.scale;
            const workspaceHeight = workspace.getParentSvg().height.baseVal.value;
            const workspaceWidth = workspace.getParentSvg().width.baseVal.value;
            const canvas = workspace.isDragSurfaceActive_ && workspace.workspaceDragSurface_ ?
                workspace.workspaceDragSurface_.SVG_ : workspace.getCanvas();
            const canvasPos = ScratchBlocks.utils.getRelativeXY(canvas);
            const margin = OFFSCREEN_CULLING_SCREEN_MARGIN;

            for (let i = 0; i < this.observing.length; i++) {
                const block = this.observing[i];
                const rootBlock = typeof block.getRootBlock === 'function' ?
                    block.getRootBlock() : block;
                const blockBounds = typeof rootBlock.getScriptBoundingRectangle === 'function' ?
                    rootBlock.getScriptBoundingRectangle() : rootBlock.getBoundingRectangle();
                const blockLeft = canvasPos.x + (blockBounds.topLeft.x * workspaceScale);
                const blockTop = canvasPos.y + (blockBounds.topLeft.y * workspaceScale);
                const blockRight = canvasPos.x + (blockBounds.bottomRight.x * workspaceScale);
                const blockBottom = canvasPos.y + (blockBounds.bottomRight.y * workspaceScale);

                let visible = true;
                if (blockTop - margin > workspaceHeight) {
                    visible = false;
                } else if (blockLeft - margin > workspaceWidth) {
                    visible = false;
                } else if (blockRight + margin < 0 || blockBottom + margin < 0) {
                    visible = false;
                }

                block.setIntersects(visible);
            }
        };
    }
};

const isLoaded = () => !!_ScratchBlocks;

const get = () => {
    if (!isLoaded()) {
        throw new Error('scratch-blocks is not loaded yet');
    }
    return _ScratchBlocks;
};

const load = () => {
    if (_ScratchBlocks) {
        return Promise.resolve();
    }
    return import(/* webpackChunkName: "sb" */ 'scratch-blocks')
        .then(m => {
            _ScratchBlocks = m.default;
            patchOffscreenTopBlockCulling(_ScratchBlocks);
            return _ScratchBlocks;
        });
};

export default {
    get,
    isLoaded,
    load
};
