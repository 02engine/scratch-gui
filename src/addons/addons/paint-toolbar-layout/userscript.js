/*
 * 造像工具栏布局：把 scratch-paint 在窄窗口下的单列工具栏改回多列换行，
 * 工具过多时允许纵向滚动，并把当前选中的工具滚动到可见范围。
 * 只用 CSS + DOM 观察，不改 scratch-paint 源码。
 */

const TOOLBAR_SELECTOR = "[class^='paint-editor_mode-selector']";
const SELECTED_SELECTOR = "[class*='is-selected']";

const scrollSelectedIntoView = toolbar => {
    if (!toolbar) return;
    const selected = toolbar.querySelector(SELECTED_SELECTOR);
    if (!selected || typeof selected.scrollIntoView !== 'function') return;
    // 工具栏可滚动时才需要滚动，避免整页被带偏
    if (toolbar.scrollHeight <= toolbar.clientHeight) return;
    selected.scrollIntoView({block: 'nearest', inline: 'nearest'});
};

export default async ({addon, console}) => {
    let toolbar = null;
    let observer = null;

    const attach = element => {
        if (toolbar === element) return;
        toolbar = element;
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => scrollSelectedIntoView(toolbar));
        observer.observe(toolbar, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
        scrollSelectedIntoView(toolbar);
    };

    const isPaintTabActive = () => {
        const state = addon.tab.redux.state;
        return Boolean(state && state.scratchGui &&
            state.scratchGui.editorTab.activeTabIndex === 1 &&
            !state.scratchGui.mode.isPlayerOnly);
    };

    const findToolbar = () => document.querySelector(TOOLBAR_SELECTOR);

    // 造像页打开时工具栏才存在；切页后要重新接管
    await addon.tab.waitForElement(TOOLBAR_SELECTOR, {
        markAsSeen: true,
        reduxCondition: isPaintTabActive
    }).then(element => attach(element));

    if (!addon.tab.redux) {
        console.warn('Redux 不可用，工具栏布局优化未启动');
        return;
    }

    addon.tab.redux.addEventListener('statechanged', ({detail}) => {
        const action = detail.action;
        if (!action) return;
        const leaving = (action.type === 'scratch-gui/navigation/ACTIVATE_TAB' && action.activeTabIndex !== 1) ||
            (action.type === 'scratch-gui/mode/SET_PLAYER' && action.isPlayerOnly);
        if (leaving) {
            if (observer) observer.disconnect();
            observer = null;
            toolbar = null;
            return;
        }
        // 工具在向量/位图模式间切换时会被整体重建
        if (action.type === 'scratch-paint/formats/CHANGE_FORMAT' ||
            action.type === 'scratch-gui/navigation/ACTIVATE_TAB' ||
            action.type === 'scratch-paint/mode/SET_MODE') {
            const element = findToolbar();
            if (element) attach(element);
        }
    });
};
