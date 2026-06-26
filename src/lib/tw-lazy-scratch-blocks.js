let _ScratchBlocks = null;

const OFFSCREEN_CULLING_SCREEN_MARGIN = 480;

const patchOffscreenTopBlockCulling = ScratchBlocks => {
    if (ScratchBlocks.__twOffscreenTopBlockCullingPatched) {
        return;
    }
    ScratchBlocks.__twOffscreenTopBlockCullingPatched = true;
    ScratchBlocks.__twOffscreenCullingScreenMargin = OFFSCREEN_CULLING_SCREEN_MARGIN;

    const WorkspaceSvg = ScratchBlocks.WorkspaceSvg;
    if (WorkspaceSvg && WorkspaceSvg.prototype && WorkspaceSvg.prototype.isBlockInViewport_) {
        WorkspaceSvg.prototype.isBlockInViewport_ = function (block) {
            const metrics = this.getMetrics && this.getMetrics();
            if (!metrics) {
                return true;
            }

            const blockRect = block.getBoundingRectangle();
            const padding = OFFSCREEN_CULLING_SCREEN_MARGIN / (this.scale || 1);
            const viewLeft = -metrics.viewLeft - padding;
            const viewRight = -metrics.viewLeft + metrics.viewWidth + padding;
            const viewTop = -metrics.viewTop - padding;
            const viewBottom = -metrics.viewTop + metrics.viewHeight + padding;

            return !(blockRect.bottomRight.x < viewLeft ||
                blockRect.topLeft.x > viewRight ||
                blockRect.bottomRight.y < viewTop ||
                blockRect.topLeft.y > viewBottom);
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
            const RTL = workspace.RTL;
            const workspaceHeight = workspace.getParentSvg().height.baseVal.value;
            const workspaceWidth = workspace.getParentSvg().width.baseVal.value;
            const canvasPos = workspace.isDragSurfaceActive_ ?
                ScratchBlocks.utils.getRelativeXY(workspace.workspaceDragSurface_.SVG_) :
                ScratchBlocks.utils.getRelativeXY(workspace.getCanvas());
            const margin = OFFSCREEN_CULLING_SCREEN_MARGIN;

            for (let i = 0; i < this.observing.length; i++) {
                const block = this.observing[i];
                const blockPos = block.getRelativeToSurfaceXY();
                let blockSize = null;
                if (RTL) {
                    blockSize = block.getHeightWidth();
                    blockPos.x -= blockSize.width;
                    blockSize.width *= workspaceScale;
                    blockSize.height *= workspaceScale;
                }
                blockPos.x *= workspaceScale;
                blockPos.y *= workspaceScale;

                let visible = true;
                if (canvasPos.y + blockPos.y - margin > workspaceHeight) {
                    visible = false;
                } else if (canvasPos.x + blockPos.x - margin > workspaceWidth) {
                    visible = false;
                } else {
                    if (!blockSize) {
                        blockSize = block.getHeightWidth();
                        blockSize.width *= workspaceScale;
                        blockSize.height *= workspaceScale;
                    }
                    if (canvasPos.x + blockPos.x + blockSize.width + margin < 0) {
                        visible = false;
                    } else if (canvasPos.y + blockPos.y + blockSize.height + margin < 0) {
                        visible = false;
                    }
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
