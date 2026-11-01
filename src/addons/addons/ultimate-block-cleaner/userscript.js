export default async function ({ addon, console }) {
  const ScratchBlocks = await addon.tab.traps.getBlockly();
  const getVm = () => addon.tab.traps.vm;

  // 判断一个积木是否为帽块；procedure_definition 也算帽块（不允许被当作无头块清理）。
  const isHatBlock = block => {
    if (!block) return false;
    if (block.type === 'procedures_definition') return true;
    const vm = getVm();
    const runtime = vm && vm.runtime;
    return !!(runtime && typeof runtime.getIsHat === 'function' && runtime.getIsHat(block.type));
  };

  const getWorkspace = () => ScratchBlocks.getMainWorkspace && ScratchBlocks.getMainWorkspace();

  // 统一删除，并将所有删除操作合并成一个撤销组。
  const disposeBlocks = (blocks, groupName) => {
    if (!blocks.length) return 0;

    let previousGroup = false;
    try {
      previousGroup = ScratchBlocks.Events.getGroup && ScratchBlocks.Events.getGroup();
      ScratchBlocks.Events.setGroup(groupName);
    } catch (e) {}

    let removedCount = 0;
    for (const block of blocks) {
      if (!block || (typeof block.isDead === 'function' && block.isDead())) continue;
      try {
        block.dispose(true);
        removedCount++;
      } catch (e) {
        console.error('删除积木失败:', e);
      }
    }

    try {
      ScratchBlocks.Events.setGroup(previousGroup || false);
    } catch (e) {}
    return removedCount;
  };

  // 收集所有"独立积木"：无头块（顶层但不是帽块/自定义积木定义）
  // 与孤立帽块（帽块顶层且后面没有连接任何积木）。
  const collectIsolatedBlocks = () => {
    const workspace = getWorkspace();
    if (!workspace) return [];

    const isolated = new Set();
    for (const block of workspace.getTopBlocks(true)) {
      if (!block) continue;
      if (!isHatBlock(block)) {
        // 无头块
        isolated.add(block);
      } else if (block.type !== 'procedures_definition' && !block.getNextBlock()) {
        // 孤立帽块
        isolated.add(block);
      }
    }
    return Array.from(isolated);
  };

  // 一次性清理独立积木（无头块 + 孤立帽块）。
  const cleanIsolatedBlocks = () => disposeBlocks(collectIsolatedBlocks(), 'UltimateBlockCleaner');

  addon.tab.createBlockContextMenu(
    (items, block) => {
      if (addon.self.disabled) return items;
      items.push({
        enabled: true,
        text: '清理独立积木',
        separator: true,
        callback: async () => {
          const confirmed = await addon.tab.confirm(
            '清理独立积木',
            '确定要删除所有独立积木（没有帽块的孤立脚本和孤立的帽块）吗？此操作无法撤销。'
          );
          if (!confirmed) return;
          const removedCount = cleanIsolatedBlocks();
          console.log(`[UltimateBlockCleaner] 已删除独立积木: ${removedCount}`);
        },
      });
      return items;
    },
    { workspace: true, blocks: true }
  );
}
