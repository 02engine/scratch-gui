/*
 * Pure geometry worker for the Canvas block renderer.
 *
 * This file intentionally has no imports and no Blockly dependency. The
 * renderer serializes a read-only graph snapshot before sending it here.
 * Native Blockly measurement, addons and interaction stay on the main thread.
 */
/**
 * Start the isolated geometry worker.
 * @returns {void}
 */
export default function canvasLayoutWorkerMain () {
    const unionRect = (a, b) => {
        if (!a) return {left: b.left, top: b.top, right: b.right, bottom: b.bottom};
        return {
            left: Math.min(a.left, b.left),
            top: Math.min(a.top, b.top),
            right: Math.max(a.right, b.right),
            bottom: Math.max(a.bottom, b.bottom)
        };
    };

    const addBucket = (buckets, x, y, blockIndex) => {
        const key = `${x}:${y}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = [];
            buckets.set(key, bucket);
        }
        bucket.push(blockIndex);
    };

    self.onmessage = event => {
        const request = event.data || {};
        if (request.type !== 'project') return;
        try {
            const nodes = request.nodes || [];
            const rootIndex = request.rootIndex;
            const cellSize = request.cellSize || 256;
            const positions = new Map();
            const paintBounds = new Map();
            const buckets = new Map();
            const stack = [{index: rootIndex, x: 0, y: 0}];
            let bounds = null;

            while (stack.length) {
                const current = stack.pop();
                const node = nodes[current.index];
                if (!node || positions.has(current.index)) continue;
                positions.set(current.index, {x: current.x, y: current.y});
                const width = Math.max(1, Number(node.width) || 64);
                const height = Math.max(1, Number(node.height) || 48);
                const paint = {
                    left: current.x - 4,
                    top: current.y - (node.startHat ? 28 : 4),
                    right: current.x + width + 4,
                    bottom: current.y + height + 4
                };
                paintBounds.set(current.index, paint);
                bounds = unionRect(bounds, paint);
                const minX = Math.floor(paint.left / cellSize);
                const maxX = Math.floor(paint.right / cellSize);
                const minY = Math.floor(paint.top / cellSize);
                const maxY = Math.floor(paint.bottom / cellSize);
                for (let bucketX = minX; bucketX <= maxX; bucketX++) {
                    for (let bucketY = minY; bucketY <= maxY; bucketY++) {
                        addBucket(buckets, bucketX, bucketY, current.index);
                    }
                }
                const edges = node.edges || [];
                for (let index = edges.length - 1; index >= 0; index--) {
                    const edge = edges[index];
                    if (!edge || !nodes[edge[0]]) continue;
                    stack.push({
                        index: edge[0],
                        x: current.x + (Number(edge[1]) || 0),
                        y: current.y + (Number(edge[2]) || 0)
                    });
                }
            }

            const positionResult = [];
            positions.forEach((position, index) => {
                positionResult.push([index, position.x, position.y]);
            });
            const paintResult = [];
            paintBounds.forEach((paint, index) => {
                paintResult.push([index, paint.left, paint.top, paint.right, paint.bottom]);
            });
            const bucketResult = [];
            buckets.forEach((value, key) => bucketResult.push([key, value]));
            self.postMessage({
                type: 'projected',
                requestId: request.requestId,
                rootId: request.rootId,
                version: request.version,
                positions: positionResult,
                paintBounds: paintResult,
                buckets: bucketResult,
                bounds
            });
        } catch (error) {
            self.postMessage({
                type: 'error',
                requestId: request.requestId,
                rootId: request.rootId,
                version: request.version,
                message: error && error.message ? error.message : String(error)
            });
        }
    };
}
