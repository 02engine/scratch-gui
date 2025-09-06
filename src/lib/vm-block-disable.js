class VMBlockDisableManager {
    constructor (vm) {
        this.vm = vm;
        this.disabledBlocks = new Set();
        
        // Patch VM to handle disabled blocks
        this.patchVM();
    }

    patchVM () {
        const originalStepThreads = this.vm.runtime.sequencer.stepThreads;
        const self = this;

        this.vm.runtime.sequencer.stepThreads = function (threads) {
            if (!threads || !Array.isArray(threads)) {
                return originalStepThreads.call(this, threads);
            }
            const activeThreads = threads.filter(thread => {
                if (self.isBlockDisabled(thread.topBlock)) {
                    return false;
                }
                return true;
            });
            return originalStepThreads.call(this, activeThreads);
        };

        // Add methods to VM
        this.vm.setBlockDisabledState = (blockId, disabled) => {
            if (disabled) {
                this.disabledBlocks.add(blockId);
            } else {
                this.disabledBlocks.delete(blockId);
            }
        };

        this.vm.getBlockDisabledState = blockId => this.disabledBlocks.has(blockId);

        this.vm.clearAllDisabledBlocks = () => {
            this.disabledBlocks.clear();
        };
    }

    isBlockDisabled (block) {
        if (!block) return false;
        
        // Check if this block is disabled
        if (this.disabledBlocks.has(block.id)) {
            return true;
        }

        // Check if any parent block is disabled
        let parent = block.getParent();
        while (parent) {
            if (this.disabledBlocks.has(parent.id)) {
                return true;
            }
            parent = parent.getParent();
        }

        return false;
    }

    // Recursively disable/enable a block and all its children
    setBlockTreeDisabled (block, disabled) {
        this.vm.setBlockDisabledState(block.id, disabled);
        
        block.getChildren().forEach(child => {
            if (child instanceof Blockly.Block) {
                this.setBlockTreeDisabled(child, disabled);
            }
        });
    }
}

export default VMBlockDisableManager;
