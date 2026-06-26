import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Draggable from 'react-draggable';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import {ContextMenuTrigger} from 'react-contextmenu';
import {BorderedMenuItem, ContextMenu, MenuItem} from '../context-menu/context-menu.jsx';
import Box from '../box/box.jsx';
import DefaultMonitor from './default-monitor.jsx';
import LargeMonitor from './large-monitor.jsx';
import SliderMonitor from '../../containers/slider-monitor.jsx';
import ListMonitor from '../../containers/list-monitor.jsx';
import {Theme} from '../../lib/themes/index.js';

import styles from './monitor.css';

const DraggableCore = Draggable.DraggableCore;

// Map category name to color name used in scratch-blocks Blockly.Colours
const categoryColorMap = {
    data: 'data',
    sensing: 'sensing',
    sound: 'sounds',
    looks: 'looks',
    motion: 'motion',
    list: 'data_lists',
    extension: 'pen'
};

const modes = {
    default: DefaultMonitor,
    large: LargeMonitor,
    slider: SliderMonitor,
    list: ListMonitor
};

class ScaledMonitorDraggable extends React.Component {
    constructor (props) {
        super(props);
        this.position = {x: 0, y: 0};
        this.state = {dragging: false, x: 0, y: 0};
    }
    setElement = node => {
        this.node = node;
        const childRef = React.Children.only(this.props.children).props.componentRef;
        if (childRef) childRef(node);
    };
    getScale () {
        const scale = this.props.scale || 1;
        return isFinite(scale) && scale > 0 ? scale : 1;
    }
    getBoundPosition (x, y) {
        if (!this.node) return {x, y};

        const boundsNode = this.node.ownerDocument.querySelector(this.props.bounds);
        if (!boundsNode) return {x, y};

        const scale = this.getScale();
        const boundsRect = boundsNode.getBoundingClientRect();
        const boundsWidth = boundsRect.width / scale;
        const boundsHeight = boundsRect.height / scale;
        const left = -this.node.offsetLeft;
        const top = -this.node.offsetTop;
        const right = boundsWidth - this.node.offsetWidth - this.node.offsetLeft;
        const bottom = boundsHeight - this.node.offsetHeight - this.node.offsetTop;

        return {
            x: Math.max(left, Math.min(x, right)),
            y: Math.max(top, Math.min(y, bottom))
        };
    }
    handleDragStart = () => {
        this.setState({dragging: true});
    };
    handleDrag = (e, data) => {
        const scale = this.getScale();
        this.position = this.getBoundPosition(
            this.position.x + (data.deltaX / scale),
            this.position.y + (data.deltaY / scale)
        );
        this.setState(this.position);
    };
    handleDragStop = e => {
        this.setState(Object.assign({dragging: false}, this.position));
        this.props.onStop(e, this.position);
    };
    render () {
        const child = React.Children.only(this.props.children);
        return (
            <DraggableCore
                cancel={this.props.cancel}
                disabled={this.props.disabled}
                enableUserSelectHack={false}
                onDrag={this.handleDrag}
                onStart={this.handleDragStart}
                onStop={this.handleDragStop}
            >
                {React.cloneElement(child, {
                    className: classNames(child.props.className, {
                        [this.props.defaultClassNameDragging]: this.state.dragging
                    }),
                    componentRef: this.setElement,
                    style: Object.assign({}, child.props.style, {
                        transform: `translate(${this.state.x}px,${this.state.y}px)`
                    })
                })}
            </DraggableCore>
        );
    }
}

ScaledMonitorDraggable.propTypes = {
    bounds: PropTypes.string.isRequired,
    cancel: PropTypes.string,
    children: PropTypes.node.isRequired,
    defaultClassNameDragging: PropTypes.string,
    disabled: PropTypes.bool,
    onStop: PropTypes.func.isRequired,
    scale: PropTypes.number
};

ScaledMonitorDraggable.defaultProps = {
    scale: 1
};

const getCategoryColor = (theme, category) => {
    const colors = theme.getStageBlockColors();
    return {
        background: colors[categoryColorMap[category]].primary,
        text: colors.text
    };
};

const MonitorComponent = props => (
    <ContextMenuTrigger
        // TW: if export is defined, we always show it, even outside of the editor
        disable={!props.draggable && !props.onExport}
        holdToDisplay={props.mode === 'slider' ? -1 : 1000}
        id={`monitor-${props.label}`}
    >
        <ScaledMonitorDraggable
            bounds=".monitor-overlay" // Class for monitor container
            cancel=".no-drag" // Class used for slider input to prevent drag
            defaultClassNameDragging={styles.dragging}
            disabled={!props.draggable}
            scale={props.dragScale}
            onStop={props.onDragEnd}
        >
            <Box
                className={styles.monitorContainer}
                componentRef={props.componentRef}
                onDoubleClick={props.mode === 'list' || !props.draggable ? null : props.onNextMode}
                data-id={props.id}
                data-opcode={props.opcode}
            >
                {React.createElement(modes[props.mode], {
                    categoryColor: getCategoryColor(props.theme, props.category),
                    ...props
                })}
            </Box>
        </ScaledMonitorDraggable>
        {ReactDOM.createPortal((
            // Use a portal to render the context menu outside the flow to avoid
            // positioning conflicts between the monitors `transform: scale` and
            // the context menus `position: fixed`. For more details, see
            // http://meyerweb.com/eric/thoughts/2011/09/12/un-fixing-fixed-elements-with-css-transforms/
            <ContextMenu id={`monitor-${props.label}`}>
                {props.draggable && props.onSetModeToDefault &&
                    <MenuItem onClick={props.onSetModeToDefault}>
                        <FormattedMessage
                            defaultMessage="normal readout"
                            description="Menu item to switch to the default monitor"
                            id="gui.monitor.contextMenu.default"
                        />
                    </MenuItem>}
                {props.draggable && props.onSetModeToLarge &&
                    <MenuItem onClick={props.onSetModeToLarge}>
                        <FormattedMessage
                            defaultMessage="large readout"
                            description="Menu item to switch to the large monitor"
                            id="gui.monitor.contextMenu.large"
                        />
                    </MenuItem>}
                {props.draggable && props.onSetModeToSlider &&
                    <MenuItem onClick={props.onSetModeToSlider}>
                        <FormattedMessage
                            defaultMessage="slider"
                            description="Menu item to switch to the slider monitor"
                            id="gui.monitor.contextMenu.slider"
                        />
                    </MenuItem>}
                {props.draggable && props.onSliderPromptOpen && props.mode === 'slider' &&
                    <BorderedMenuItem onClick={props.onSliderPromptOpen}>
                        <FormattedMessage
                            defaultMessage="change slider range"
                            description="Menu item to change the slider range"
                            id="gui.monitor.contextMenu.sliderRange"
                        />
                    </BorderedMenuItem>}
                {props.onImport &&
                    <MenuItem onClick={props.onImport}>
                        <FormattedMessage
                            defaultMessage="import"
                            description="Menu item to import into list monitors"
                            id="gui.monitor.contextMenu.import"
                        />
                    </MenuItem>}
                {props.onExport &&
                    <MenuItem onClick={props.onExport}>
                        <FormattedMessage
                            defaultMessage="export"
                            description="Menu item to export from list monitors"
                            id="gui.monitor.contextMenu.export"
                        />
                    </MenuItem>}
                {props.draggable && props.onHide &&
                    <BorderedMenuItem onClick={props.onHide}>
                        <FormattedMessage
                            defaultMessage="hide"
                            description="Menu item to hide the monitor"
                            id="gui.monitor.contextMenu.hide"
                        />
                    </BorderedMenuItem>}
            </ContextMenu>
        ), document.body)}
    </ContextMenuTrigger>

);

const monitorModes = Object.keys(modes);

MonitorComponent.propTypes = {
    category: PropTypes.oneOf(Object.keys(categoryColorMap)),
    componentRef: PropTypes.func.isRequired,
    draggable: PropTypes.bool.isRequired,
    dragScale: PropTypes.number,
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    mode: PropTypes.oneOf(monitorModes),
    opcode: PropTypes.string.isRequired,
    onDragEnd: PropTypes.func.isRequired,
    onExport: PropTypes.func,
    onImport: PropTypes.func,
    onHide: PropTypes.func,
    onNextMode: PropTypes.func.isRequired,
    onSetModeToDefault: PropTypes.func,
    onSetModeToLarge: PropTypes.func,
    onSetModeToSlider: PropTypes.func,
    onSliderPromptOpen: PropTypes.func,
    theme: PropTypes.instanceOf(Theme).isRequired
};

MonitorComponent.defaultProps = {
    category: 'extension',
    mode: 'default'
};

export {
    MonitorComponent as default,
    monitorModes
};
