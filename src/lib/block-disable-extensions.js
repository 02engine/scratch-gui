import {addContextMenu} from '../addons/contextmenu';

let copyJsCodeExtensionInitialized = false;

const initializeBlockDisableExtension = vm => {
    if (copyJsCodeExtensionInitialized) return;
    copyJsCodeExtensionInitialized = true;

    // Add context menu item for blocks using addons API
    console.log('Initializing Copy JS Code extension with VM:', vm);
    if (window.addon && window.addon.tab && window.addon.tab.createBlockContextMenu) {
        console.log('Using addons API for context menu');
        window.addon.tab.createBlockContextMenu((items, ctx) => {
            console.log('Context menu callback called, ctx:', ctx, 'block:', ctx ? ctx.block : 'none');
            if (!ctx || !ctx.block) return items;
            
            // Add "Copy JS Code" option for hat blocks (top-level blocks)
            // Check if this is a hat block (no previous block)
            const isHatBlock = !ctx.block.getPreviousBlock();
            console.log('Checking Copy JS Code option:', {
                blockId: ctx.block.id,
                isHatBlock: isHatBlock,
                hasGetPreviousBlock: typeof ctx.block.getPreviousBlock,
                previousBlock: ctx.block.getPreviousBlock(),
                hasGetBlockCompiledSource: !!vm.getBlockCompiledSource
            });
            if (isHatBlock && vm.getBlockCompiledSource) {
                console.log('Adding Copy JS Code menu item for block:', ctx.block.id);
                items.push({
                    enabled: true,
                    text: 'Copy JS Code',
                    callback: () => {
                        try {
                            const jsCode = vm.getBlockCompiledSource(ctx.block.id);
                            if (jsCode) {
                                // Copy to clipboard
                                navigator.clipboard.writeText(jsCode).then(() => {
                                    console.log('JavaScript code copied to clipboard:', jsCode);
                                    // Optional: Show a notification
                                    if (window.addon && window.addon.tab && window.addon.tab.redux && window.addon.tab.redux.dispatch) {
                                        window.addon.tab.redux.dispatch({
                                            type: 'alerts/addAlert',
                                            message: 'JavaScript code copied to clipboard',
                                            alertType: 'info'
                                        });
                                    }
                                }).catch(err => {
                                    console.error('Failed to copy to clipboard:', err);
                                });
                            } else {
                                console.warn('No compiled JavaScript code available for block:', ctx.block.id);
                            }
                        } catch (error) {
                            console.error('Error getting compiled JavaScript code:', error);
                        }
                    },
                    separator: true
                });
            }
            
            return items;
        }, {blocks: true});
    } else {
        // Fallback: Use direct context menu patching
        console.warn('Addon API not available, using fallback context menu');
        console.log('Checking for ScratchBlocks/Blockly:', {
            hasWindowScratchBlocks: !!window.ScratchBlocks,
            hasWindowBlockly: !!window.Blockly,
            ScratchBlocks: window.ScratchBlocks ? 'present' : 'missing',
            Blockly: window.Blockly ? 'present' : 'missing'
        });
        
        // Patch ScratchBlocks context menu directly
        // Use ScratchBlocks instead of Blockly as global variable
        const ScratchBlocks = window.ScratchBlocks || window.Blockly;
        if (ScratchBlocks && ScratchBlocks.ContextMenu && ScratchBlocks.ContextMenu.show && typeof ScratchBlocks.ContextMenu.show === 'function') {
            console.log('Patching ScratchBlocks.ContextMenu.show');
            const originalShow = ScratchBlocks.ContextMenu.show;
            ScratchBlocks.ContextMenu.show = function (event, items, rtl) {
                console.log('Patched ContextMenu.show called, gesture:', ScratchBlocks.mainWorkspace ? ScratchBlocks.mainWorkspace.currentGesture_ : 'no workspace');
                const gesture = ScratchBlocks.mainWorkspace && ScratchBlocks.mainWorkspace.currentGesture_;
                const block = gesture && gesture.targetBlock_;
                
                if (block) {
                    console.log('Context menu for block:', block.id, 'type:', block.type);

                    // Add "Copy JS Code" option for hat blocks (top-level blocks)
                    // Check if this is a hat block (no previous block)
                    const isHatBlock = !block.getPreviousBlock();
                    console.log('Fallback: Checking Copy JS Code option:', {
                        blockId: block.id,
                        blockType: block.type,
                        isHatBlock: isHatBlock,
                        hasGetPreviousBlock: typeof block.getPreviousBlock,
                        previousBlock: block.getPreviousBlock(),
                        hasGetBlockCompiledSource: !!vm.getBlockCompiledSource
                    });
                    if (isHatBlock && vm.getBlockCompiledSource) {
                        items.push({
                            enabled: true,
                            text: 'Copy JS Code',
                            callback: () => {
                                try {
                                    const jsCode = vm.getBlockCompiledSource(block.id);
                                    if (jsCode) {
                                        // Copy to clipboard
                                        navigator.clipboard.writeText(jsCode).then(() => {
                                            console.log('JavaScript code copied to clipboard:', jsCode);
                                            // Optional: Show a notification
                                            if (window.addon && window.addon.tab && window.addon.tab.redux && window.addon.tab.redux.dispatch) {
                                                window.addon.tab.redux.dispatch({
                                                    type: 'alerts/addAlert',
                                                    message: 'JavaScript code copied to clipboard',
                                                    alertType: 'info'
                                                });
                                            }
                                        }).catch(err => {
                                            console.error('Failed to copy to clipboard:', err);
                                        });
                                    } else {
                                        console.warn('No compiled JavaScript code available for block,copy id to clipboard:', block.id);
                                        navigator.clipboard.writeText(block.id).then(() => {
                                            console.log('Block ID copied to clipboard:', block.id);
                                            // Optional: Show a notification
                                            if (window.addon && window.addon.tab && window.addon.tab.redux && window.addon.tab.redux.dispatch) {
                                                window.addon.tab.redux.dispatch({
                                                    type: 'alerts/addAlert',
                                                    message: 'Block id copied to clipboard',
                                                    alertType: 'info'
                                                })
                                            }
                                        })
                                    }
                                } catch (error) {
                                    console.error('Error getting compiled JavaScript code:', error);
                                }
                            },
                            separator: true
                        });
                    }
                }
                
                return originalShow.call(this, event, items, rtl);
            };
        } else {
            console.warn('ScratchBlocks/Blockly not available for context menu patching');
        }
    }
};

export default initializeBlockDisableExtension;
