import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import makeToolboxXML from '../lib/make-toolbox-xml';
import {defaultBlockColors} from '../lib/themes';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import {
    CATEGORY_MESSAGE_KEYS,
    CATEGORY_NAME_FALLBACKS,
    DEFAULT_TOOLBOX_LAYOUT,
    STATIC_CATEGORY_IDS,
    collectDefaultBlocks,
    normalizeToolboxLayout,
    resolveMessageReferences
} from '../lib/custom-toolbox-layout';
import {closeToolboxLayoutModal} from '../reducers/modals';
import {setToolboxLayoutState} from '../reducers/tw';
import ToolboxLayoutModalComponent from '../components/tw-toolbox-layout-modal/toolbox-layout-modal.jsx';

const getDefaultBlocksForSprite = () => collectDefaultBlocks(makeToolboxXML(false, false, '', [], '', '', '', defaultBlockColors));

const createGroupId = () => `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const PREVIEW_OPTIONS = {
    comments: false,
    collapse: false,
    readOnly: true,
    scrollbars: false,
    zoom: {
        controls: false,
        wheel: false,
        startScale: 0.85
    }
};

class BlockPreview extends React.Component {
    constructor (props) {
        super(props);
        this.setBlocks = this.setBlocks.bind(this);
    }
    componentWillUnmount () {
        if (this.workspace) {
            this.workspace.dispose();
            this.workspace = null;
        }
    }
    setBlocks (blocksRef) {
        if (!blocksRef || this.workspace) return;
        this.blocksRef = blocksRef;
        const ScratchBlocks = LazyScratchBlocks.get();
        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;
        this.workspace = ScratchBlocks.inject(blocksRef, Object.assign({}, PREVIEW_OPTIONS, {
            media: this.props.media
        }));
        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;
        this.workspace.options.readOnly = true;
        this.workspace.newBlockWithXml_ = null;
        this.renderBlock();
    }
    componentDidUpdate (prevProps) {
        if (this.props.block.xmlText !== prevProps.block.xmlText && this.workspace) {
            this.renderBlock();
        }
    }
    renderBlock () {
        if (!this.workspace || !this.props.block.xmlText) return;
        this.workspace.clear();
        const ScratchBlocks = LazyScratchBlocks.get();
        const xml = ScratchBlocks.Xml.textToDom(`<xml>${this.props.block.xmlText}</xml>`);
        const blockId = ScratchBlocks.Xml.domToWorkspace(xml, this.workspace)[0];
        const block = this.workspace.getBlockById(blockId);
        if (block) {
            block.initSvg();
            block.render(false);
            block.setMovable(false);
            block.setDeletable(false);
            if (this.workspace.svgGroup_) {
                this.workspace.svgGroup_.style.display = 'block';
            }
            this.workspace.resize();
            ScratchBlocks.svgResize(this.workspace);
        }
        this.workspace.hideChaff && this.workspace.hideChaff();
    }
    render () {
        return <div className={this.props.className} ref={this.setBlocks} />;
    }
}

class ToolboxLayoutModal extends React.Component {
    constructor (props) {
        super(props);
        this.blocks = getDefaultBlocksForSprite();
        this.state = {
            selectedGroupId: props.toolboxLayout.groups[0] && props.toolboxLayout.groups[0].id
        };
        this.handleToggleEnabled = this.handleToggleEnabled.bind(this);
        this.handleReset = this.handleReset.bind(this);
        this.handleToggleBlockHidden = this.handleToggleBlockHidden.bind(this);
        this.handleAddGroup = this.handleAddGroup.bind(this);
        this.handleSelectGroup = this.handleSelectGroup.bind(this);
        this.handleUpdateGroup = this.handleUpdateGroup.bind(this);
        this.handleDeleteGroup = this.handleDeleteGroup.bind(this);
        this.handleToggleBlockInGroup = this.handleToggleBlockInGroup.bind(this);
        this.isBlockHidden = this.isBlockHidden.bind(this);
    }
    setLayout (layout) {
        this.props.setToolboxLayout(normalizeToolboxLayout(layout));
    }
    handleToggleEnabled (e) {
        this.setLayout(Object.assign({}, this.props.toolboxLayout, {
            enabled: e.target.checked
        }));
    }
    handleReset () {
        this.setState({selectedGroupId: null});
        this.setLayout(DEFAULT_TOOLBOX_LAYOUT);
    }
    handleToggleBlockHidden (block) {
        const layout = this.props.toolboxLayout;
        const hiddenBlocks = Object.assign({}, layout.hiddenBlocks);
        const hidden = new Set(hiddenBlocks[block.categoryId] || []);
        if (hidden.has(block.key)) {
            hidden.delete(block.key);
        } else {
            hidden.add(block.key);
        }
        hiddenBlocks[block.categoryId] = Array.from(hidden);
        const groups = hidden.has(block.key) ? layout.groups : layout.groups.map(group => Object.assign({}, group, {
            blocks: group.blocks.filter(groupBlock => groupBlock.key !== block.key)
        }));
        this.setLayout(Object.assign({}, layout, {
            hiddenBlocks,
            groups
        }));
    }
    handleToggleBlockInGroup (groupId, block) {
        const nextGroups = this.props.toolboxLayout.groups.map(group => {
            if (group.id !== groupId) return group;
            const exists = group.blocks.some(existing => existing.key === block.key);
            if (exists) {
                return Object.assign({}, group, {
                    blocks: group.blocks.filter(existing => existing.key !== block.key)
                });
            }
            return Object.assign({}, group, {
                blocks: group.blocks.concat({
                    key: block.key,
                    categoryId: block.categoryId,
                    type: block.type,
                    index: block.index
                })
            });
        });
        this.setLayout(Object.assign({}, this.props.toolboxLayout, {
            groups: nextGroups
        }));
    }
    handleAddGroup (defaultName) {
        const group = {
            id: createGroupId(),
            name: defaultName,
            colour: '#4c97ff',
            secondaryColour: '#3373cc',
            blocks: []
        };
        this.setState({selectedGroupId: group.id});
        this.setLayout(Object.assign({}, this.props.toolboxLayout, {
            enabled: true,
            groups: this.props.toolboxLayout.groups.concat(group)
        }));
    }
    handleSelectGroup (id) {
        this.setState({selectedGroupId: id});
    }
    handleUpdateGroup (id, update) {
        this.setLayout(Object.assign({}, this.props.toolboxLayout, {
            groups: this.props.toolboxLayout.groups.map(group => (
                group.id === id ? Object.assign({}, group, update) : group
            ))
        }));
    }
    handleDeleteGroup (id) {
        const groups = this.props.toolboxLayout.groups.filter(group => group.id !== id);
        this.setState(state => ({
            selectedGroupId: state.selectedGroupId === id ? (groups[0] && groups[0].id) : state.selectedGroupId
        }));
        this.setLayout(Object.assign({}, this.props.toolboxLayout, {
            groups
        }));
    }
    componentDidUpdate (prevProps) {
        if (prevProps.toolboxLayout.groups !== this.props.toolboxLayout.groups) {
            const selectedExists = this.props.toolboxLayout.groups.some(group => group.id === this.state.selectedGroupId);
            if (!selectedExists) {
                this.setState({selectedGroupId: this.props.toolboxLayout.groups[0] && this.props.toolboxLayout.groups[0].id});
            }
        }
    }
    isBlockHidden (block) {
        return (this.props.toolboxLayout.hiddenBlocks[block.categoryId] || []).includes(block.key);
    }
    render () {
        const blocksByCategory = STATIC_CATEGORY_IDS.reduce((result, categoryId) => Object.assign(result, {
            [categoryId]: this.blocks.filter(block => block.categoryId === categoryId)
        }), {});
        const categoryNames = STATIC_CATEGORY_IDS.reduce((result, categoryId) => Object.assign(result, {
            [categoryId]: resolveMessageReferences(`%{BKY_CATEGORY_${CATEGORY_MESSAGE_KEYS[categoryId]}}`) || CATEGORY_NAME_FALLBACKS[categoryId] || categoryId
        }), {});
        const categoryColours = STATIC_CATEGORY_IDS.reduce((result, categoryId) => Object.assign(result, {
            [categoryId]: this.blocks.find(block => block.categoryId === categoryId)?.categoryColour || '#4c97ff'
        }), {});
        const categorySecondaryColours = STATIC_CATEGORY_IDS.reduce((result, categoryId) => Object.assign(result, {
            [categoryId]: this.blocks.find(block => block.categoryId === categoryId)?.categorySecondaryColour || '#3373cc'
        }), {});
        return (
            <ToolboxLayoutModalComponent
                blocks={this.blocks}
                blocksByCategory={blocksByCategory}
                categoryIds={STATIC_CATEGORY_IDS}
                categoryColours={categoryColours}
                categorySecondaryColours={categorySecondaryColours}
                categoryNames={categoryNames}
                enabled={this.props.toolboxLayout.enabled}
                groups={this.props.toolboxLayout.groups}
                selectedGroupId={this.state.selectedGroupId}
                BlockPreview={BlockPreview}
                isBlockHidden={this.isBlockHidden}
                onAddGroup={this.handleAddGroup}
                onClose={this.props.onClose}
                onDeleteGroup={this.handleDeleteGroup}
                onToggleBlockInGroup={this.handleToggleBlockInGroup}
                onToggleBlockHidden={this.handleToggleBlockHidden}
                onReset={this.handleReset}
                onToggleEnabled={this.handleToggleEnabled}
                onUpdateGroup={this.handleUpdateGroup}
                onSelectGroup={this.handleSelectGroup}
                media={this.props.media}
            />
        );
    }
}

ToolboxLayoutModal.propTypes = {
    onClose: PropTypes.func,
    setToolboxLayout: PropTypes.func,
    media: PropTypes.string,
    toolboxLayout: PropTypes.shape({
        enabled: PropTypes.bool,
        hiddenBlocks: PropTypes.object,
        groups: PropTypes.array
    })
};

const mapStateToProps = state => ({
    toolboxLayout: normalizeToolboxLayout(state.scratchGui.tw.toolboxLayout)
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeToolboxLayoutModal()),
    setToolboxLayout: layout => dispatch(setToolboxLayoutState(layout))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ToolboxLayoutModal);
