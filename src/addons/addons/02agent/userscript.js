import React from 'react';
import ReactDOM from 'react-dom';
import Agent from './index.tsx';

const AgentHost = ({addonApi}) => {
    const addon = addonApi.addon;
    const vm = addon.tab.traps.vm;
    const [workspace, setWorkspace] = React.useState(() => addon.tab.traps.getWorkspace() || null);
    const getEditorThemeMode = React.useCallback(() => {
        const theme = addon.tab.redux?.state?.scratchGui?.theme?.theme;
        return typeof theme?.isDark === 'function' && theme.isDark() ? 'dark' : 'light';
    }, [addon]);
    const [editorThemeMode, setEditorThemeMode] = React.useState(getEditorThemeMode);

    React.useEffect(() => {
        let disposed = false;
        addon.tab.traps.getBlockly().then(ScratchBlocks => {
            if (disposed) return;
            if (!window.Blockly) {
                window.Blockly = ScratchBlocks;
            }
            if (!window.ScratchBlocks) {
                window.ScratchBlocks = ScratchBlocks;
            }
            setWorkspace(addon.tab.traps.getWorkspace() || ScratchBlocks.getMainWorkspace?.() || null);
        }).catch(error => {
            console.error('[02Agent] Failed to initialize Blockly hooks', error);
        });
        return () => {
            disposed = true;
        };
    }, [addon]);

    React.useEffect(() => {
        const redux = addon.tab.redux;
        if (!redux) return undefined;
        redux.initialize?.();
        const handleStateChanged = () => setEditorThemeMode(getEditorThemeMode());
        redux.addEventListener?.('statechanged', handleStateChanged);
        handleStateChanged();
        return () => redux.removeEventListener?.('statechanged', handleStateChanged);
    }, [addon, getEditorThemeMode]);

    return <Agent vm={vm} workspace={workspace} editorThemeMode={editorThemeMode} />;
};

export default addonApi => {
    const addon = addonApi.addon;
    const vm = addon.tab.traps.vm;
    if (!vm) {
        console.warn('[02Agent] VM is not ready, skipping mount');
        return;
    }

    const existing = document.querySelector('[data-sa-id="addon-02agent"]');
    if (existing) {
        ReactDOM.unmountComponentAtNode(existing);
        existing.remove();
    }

    const host = document.createElement('div');
    host.id = 'gandi-plugins-wrapper';
    host.dataset.saId = 'addon-02agent';
    Object.assign(host.style, {
        position: 'fixed',
        right: '16px',
        top: '48px',
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none'
    });
    document.body.appendChild(host);

    ReactDOM.render(<AgentHost addonApi={addonApi} />, host);

    addon.self.addEventListener('disabled', () => {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
    });
};
