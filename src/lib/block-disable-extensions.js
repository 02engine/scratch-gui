import {addContextMenu} from '../addons/contextmenu';
import VMBlockDisableManager from './vm-block-disable';

let blockDisableExtensionInitialized = false;
let vmBlockDisableManager = null;

const initializeBlockDisableExtension = vm => {
    if (blockDisableExtensionInitialized) return;
    blockDisableExtensionInitialized = true;

    // Initialize VM block disable manager
    vmBlockDisableManager = new VMBlockDisableManager(vm);

    // Add context menu item for blocks using addons API
    // Add context menu item for blocks using addons API
    if (window.addon && window.addon.tab && window.addon.tab.createBlockContextMenu) {
        window.addon.tab.createBlockContextMenu((items, ctx) => {
            if (!ctx || !ctx.block) return items;
            
            const isDisabled = vm.getBlockDisabledState && vm.getBlockDisabledState(ctx.block.id);
            
            items.push({
                text: isDisabled ? 'Enable Block' : 'Disable Block',
                callback: () => {
                    const newDisabledState = !isDisabled;
                    if (vm.setBlockDisabledState) {
                        vm.setBlockDisabledState(ctx.block.id, newDisabledState);
                        
                        // Update visual appearance
                        if (ctx.block.setDisabled) {
                            ctx.block.setDisabled(newDisabledState);
                        }
                        
                        // Recursively update child blocks
                        const updateBlockTree = (block, disabled) => {
                            if (block && block.setDisabled) {
                                block.setDisabled(disabled);
                            }
                            if (block && block.getChildren) {
                                block.getChildren().forEach(child => {
                                    if (child instanceof Blockly.Block) {
                                        updateBlockTree(child, disabled);
                                    }
                                });
                            }
                        };
                        updateBlockTree(ctx.block, newDisabledState);
                        
                        if (ctx.block.workspace && ctx.block.workspace.render) {
                            ctx.block.workspace.render();
                        }
                    }
                },
                separator: true
            });
            
            return items;
        }, {blocks: true});
    } else {
        // Fallback: Use direct context menu patching
        console.warn('Addon API not available, using fallback block disable menu');
        
        // Patch Blockly context menu directly
        if (window.Blockly && Blockly.ContextMenu && Blockly.ContextMenu.show && typeof Blockly.ContextMenu.show === 'function') {
            const originalShow = Blockly.ContextMenu.show;
            Blockly.ContextMenu.show = function (event, items, rtl) {
                const gesture = Blockly.mainWorkspace && Blockly.mainWorkspace.currentGesture_;
                const block = gesture && gesture.targetBlock_;
                
                if (block) {
                    const isDisabled = vm.getBlockDisabledState && vm.getBlockDisabledState(block.id);
                    
                    items.push({
                        text: isDisabled ? 'Enable Block' : 'Disable Block',
                        callback: () => {
                            const newDisabledState = !isDisabled;
                            if (vm.setBlockDisabledState) {
                                vm.setBlockDisabledState(block.id, newDisabledState);
                                
                                if (block.setDisabled) {
                                    block.setDisabled(newDisabledState);
                                }
                                
                                if (block.workspace && block.workspace.render) {
                                    block.workspace.render();
                                }
                            }
                        },
                        separator: true
                    });
                }
                
                return originalShow.call(this, event, items, rtl);
            };
        }
    }

    // Patch Blockly to add disabled visual styling
    if (window.addon) {
        window.addon.tab.traps.getBlockly().then(ScratchBlocks => {
            const originalRender = ScratchBlocks.BlockSvg.prototype.render;
            ScratchBlocks.BlockSvg.prototype.render = function () {
                originalRender.call(this);
                
                const isDisabled = vm.getBlockDisabledState && vm.getBlockDisabledState(this.id);
                
                if (isDisabled) {
                    this.svgPath_.setAttribute('fill-opacity', '0.5');
                    this.svgPath_.setAttribute('stroke-opacity', '0.5');
                    
                    // Gray out all text elements
                    const textElements = this.svgGroup_.querySelectorAll('text');
                    textElements.forEach(text => {
                        text.setAttribute('fill', '#888');
                    });
                } else {
                    this.svgPath_.removeAttribute('fill-opacity');
                    this.svgPath_.removeAttribute('stroke-opacity');
                    
                    // Restore original text colors
                    const textElements = this.svgGroup_.querySelectorAll('text');
                    textElements.forEach(text => {
                        text.removeAttribute('fill');
                    });
                }
            };

            // Add isDisabled property to blocks
            ScratchBlocks.BlockSvg.prototype.setDisabled = function (disabled) {
                if (vm.setBlockDisabledState) {
                    vm.setBlockDisabledState(this.id, disabled);
                }
                this.render();
            };

            ScratchBlocks.BlockSvg.prototype.getDisabled = function () {
                return (vm.getBlockDisabledState && vm.getBlockDisabledState(this.id)) || false;
            };
        });
    }
};

export default initializeBlockDisableExtension;
