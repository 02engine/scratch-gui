export const scrollBlockIntoView = (block: any, workspace: any) => {
  if (!block || !workspace) return;
  if (typeof workspace.centerOnBlock === "function") {
    workspace.centerOnBlock(block.id);
    return;
  }
  const root = typeof block.getRootBlock === "function" ? block.getRootBlock() : block;
  const pos = typeof root.getRelativeToSurfaceXY === "function" ? root.getRelativeToSurfaceXY() : null;
  const metrics = typeof workspace.getMetrics === "function" ? workspace.getMetrics() : null;
  if (pos && metrics && workspace.scrollbar?.set) {
    workspace.scrollbar.set(pos.x - metrics.contentLeft - 32, pos.y - metrics.contentTop - 32);
  }
};
