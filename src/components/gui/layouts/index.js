import { UI_LAYOUT_MODES } from '../../../lib/ui-layout-modes';
import LegacyLayout from './legacy-layout.jsx';
import New02ELayout from './new02e-layout.jsx';
import VSCodeLayout from './vscode-layout.jsx';

/**
 * Layout registry — maps each UI_LAYOUT_MODE to its rendering component.
 * To add a new layout: create the component file, then add an entry here.
 */
const LAYOUT_REGISTRY = {
    [UI_LAYOUT_MODES.LEGACY]: LegacyLayout,
    [UI_LAYOUT_MODES.NEW_02E]: New02ELayout,
    // [UI_LAYOUT_MODES.VSCODE]: VSCodeLayout
};

export default LAYOUT_REGISTRY;
