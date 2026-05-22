import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages, injectIntl, intlShape} from 'react-intl';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';
import styles from './toolbox-layout-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Customize Toolbox',
        description: 'Title of toolbox layout customization modal',
        id: 'tw.toolboxLayoutModal.title'
    },
    newGroupName: {
        defaultMessage: 'Custom Group',
        description: 'Default name for a custom toolbox group',
        id: 'tw.toolboxLayoutModal.newGroupName'
    }
});

const ToolboxLayoutModal = props => {
    const selectedGroup = props.groups.find(group => group.id === props.selectedGroupId) || props.groups[0] || null;
    const CategoryBlockPreview = props.BlockPreview;
    const selectedGroupBlockKeys = new Set(selectedGroup ? selectedGroup.blocks.map(block => block.key) : []);
    const addedBlocks = selectedGroup ? props.blocks.filter(block => selectedGroupBlockKeys.has(block.key)) : [];
    const availableBlocks = selectedGroup ? props.blocks.filter(block => !selectedGroupBlockKeys.has(block.key)) : [];
    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="toolboxLayoutModal"
        >
            <Box className={styles.body}>
                <div className={styles.topBar}>
                    <label className={styles.enableRow}>
                        <FancyCheckbox
                            className={styles.checkbox}
                            checked={props.enabled}
                            onChange={props.onToggleEnabled}
                        />
                        <FormattedMessage
                            defaultMessage="Enable custom toolbox"
                            description="Toggle custom toolbox layout"
                            id="tw.toolboxLayoutModal.enable"
                        />
                    </label>
                    <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={props.onReset}
                    >
                        <FormattedMessage
                            defaultMessage="Reset"
                            description="Reset custom toolbox layout"
                            id="tw.toolboxLayoutModal.reset"
                        />
                    </button>
                </div>
                <p className={styles.hint}>
                    <FormattedMessage
                        defaultMessage="Uncheck blocks to remove them from their default category, then add removed blocks to your own groups. Changes apply immediately."
                        description="Help text for toolbox layout customization"
                        id="tw.toolboxLayoutModal.hint"
                    />
                </p>
                <div className={styles.layoutGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <FormattedMessage
                                defaultMessage="Default Categories"
                                description="Default toolbox categories panel title"
                                id="tw.toolboxLayoutModal.defaultCategories"
                            />
                        </div>
                        <div className={styles.blockList}>
                            {props.categoryIds.map(categoryId => (
                                <div
                                    className={styles.categorySection}
                                    key={categoryId}
                                >
                                    <div className={styles.categoryTitleRow}>
                                        <span
                                            className={styles.categoryBubble}
                                            style={{
                                                backgroundColor: props.categoryColours[categoryId],
                                                borderColor: props.categorySecondaryColours[categoryId]
                                            }}
                                        />
                                        <div className={styles.categoryTitle}>{props.categoryNames[categoryId]}</div>
                                    </div>
                                    {props.blocksByCategory[categoryId].map(block => (
                                        <label
                                            className={styles.blockRow}
                                            key={block.key}
                                        >
                                            <FancyCheckbox
                                                className={styles.checkbox}
                                                checked={!props.isBlockHidden(block)}
                                                onChange={() => props.onToggleBlockHidden(block)}
                                            />
                                            <div className={styles.blockPreviewWrap}>
                                                <CategoryBlockPreview
                                                    block={block}
                                                    className={styles.blockPreview}
                                                    media={props.media}
                                                />
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className={styles.panel}>
                        <div className={styles.panelHeaderRow}>
                            <div className={styles.panelHeader}>
                                <FormattedMessage
                                    defaultMessage="Custom Groups"
                                    description="Custom toolbox groups panel title"
                                    id="tw.toolboxLayoutModal.customGroups"
                                />
                            </div>
                            <button
                                className={styles.primaryButton}
                                type="button"
                                onClick={() => props.onAddGroup(props.intl.formatMessage(messages.newGroupName))}
                            >
                                <FormattedMessage
                                    defaultMessage="Add Group"
                                    description="Add custom toolbox group button"
                                    id="tw.toolboxLayoutModal.addGroup"
                                />
                            </button>
                        </div>
                        <div className={styles.groupStrip}>
                            {props.groups.map(group => (
                                <button
                                    className={group.id === selectedGroup?.id ? styles.groupChipSelected : styles.groupChip}
                                    key={group.id}
                                    type="button"
                                    onClick={() => props.onSelectGroup(group.id)}
                                >
                                    <span className={styles.groupChipName}>{group.name}</span>
                                    <span className={styles.groupChipCount}>{group.blocks.length}</span>
                                </button>
                            ))}
                            <button
                                className={styles.groupChipAdd}
                                type="button"
                                onClick={() => props.onAddGroup(props.intl.formatMessage(messages.newGroupName))}
                            >
                                +
                            </button>
                        </div>
                        {selectedGroup ? (
                            <div className={styles.groupEditorShell}>
                                <div className={styles.groupEditorHeader}>
                                    <div className={styles.currentGroupLabel}>
                                        <FormattedMessage
                                            defaultMessage="Editing: {name}"
                                            description="Label for the active custom toolbox group"
                                            id="tw.toolboxLayoutModal.editingGroup"
                                            values={{name: selectedGroup.name}}
                                        />
                                    </div>
                                    <input
                                        className={styles.groupNameEdit}
                                        value={selectedGroup.name}
                                        onChange={event => props.onUpdateGroup(selectedGroup.id, {name: event.target.value})}
                                    />
                                    <input
                                        className={styles.groupColorInline}
                                        type="color"
                                        value={selectedGroup.colour}
                                        onChange={event => props.onUpdateGroup(selectedGroup.id, {
                                            colour: event.target.value,
                                            secondaryColour: event.target.value
                                        })}
                                    />
                                    <button
                                        className={styles.groupDeleteInline}
                                        type="button"
                                        onClick={() => props.onDeleteGroup(selectedGroup.id)}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Delete"
                                            description="Delete custom toolbox group button"
                                            id="tw.toolboxLayoutModal.deleteGroup"
                                        />
                                    </button>
                                </div>
                                <div className={styles.groupEditorColumns}>
                                    <section className={styles.groupEditorColumn}>
                                        <div className={styles.subHeader}>
                                            <FormattedMessage
                                                defaultMessage="Added blocks"
                                                description="Blocks already in selected custom group"
                                                id="tw.toolboxLayoutModal.addedBlocks"
                                            />
                                        </div>
                                        <div className={styles.blockList}>
                                            {addedBlocks.length ? addedBlocks.map(block => (
                                                <label className={styles.blockRow} key={`added-${block.key}`}>
                                                    <FancyCheckbox
                                                        className={styles.checkbox}
                                                        checked
                                                        onChange={() => props.onToggleBlockInGroup(selectedGroup.id, block)}
                                                    />
                                                    <div className={styles.blockPreviewWrap}>
                                                        <CategoryBlockPreview block={block} className={styles.blockPreview} media={props.media} />
                                                    </div>
                                                </label>
                                            )) : (
                                                <div className={styles.emptyText}>
                                                    <FormattedMessage
                                                        defaultMessage="No blocks in this group yet."
                                                        description="Empty state for selected group blocks"
                                                        id="tw.toolboxLayoutModal.noSelectedGroupBlocks"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                    <section className={styles.groupEditorColumn}>
                                        <div className={styles.subHeader}>
                                            <FormattedMessage
                                                defaultMessage="Available blocks"
                                                description="Blocks that can be added to selected custom group"
                                                id="tw.toolboxLayoutModal.availableBlocks"
                                            />
                                        </div>
                                        <div className={styles.blockList}>
                                            {availableBlocks.length ? availableBlocks.map(block => (
                                                <label className={styles.blockRow} key={`available-${block.key}`}>
                                                    <FancyCheckbox
                                                        className={styles.checkbox}
                                                        checked={false}
                                                        onChange={() => props.onToggleBlockInGroup(selectedGroup.id, block)}
                                                    />
                                                    <div className={styles.blockPreviewWrap}>
                                                        <CategoryBlockPreview block={block} className={styles.blockPreview} media={props.media} />
                                                    </div>
                                                </label>
                                            )) : (
                                                <div className={styles.emptyText}>
                                                    <FormattedMessage
                                                        defaultMessage="No more blocks available."
                                                        description="Empty state for available blocks"
                                                        id="tw.toolboxLayoutModal.noAvailableBlocks"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                <FormattedMessage
                                    defaultMessage="Create a group to start organizing blocks."
                                    description="No custom groups empty state"
                                    id="tw.toolboxLayoutModal.noGroups"
                                />
                            </div>
                        )}
                    </section>
                </div>
            </Box>
        </Modal>
    );
};

ToolboxLayoutModal.propTypes = {
    blocks: PropTypes.arrayOf(PropTypes.shape({
        categoryId: PropTypes.string,
        key: PropTypes.string,
        type: PropTypes.string,
        xmlText: PropTypes.string
    })),
    blocksByCategory: PropTypes.objectOf(PropTypes.array),
    categoryIds: PropTypes.arrayOf(PropTypes.string),
    categoryColours: PropTypes.objectOf(PropTypes.string),
    categorySecondaryColours: PropTypes.objectOf(PropTypes.string),
    categoryNames: PropTypes.objectOf(PropTypes.string),
    enabled: PropTypes.bool,
    groups: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        colour: PropTypes.string,
        blocks: PropTypes.array
    })),
    intl: intlShape,
    media: PropTypes.string,
    isBlockHidden: PropTypes.func,
    onAddGroup: PropTypes.func,
    onClose: PropTypes.func,
    onDeleteGroup: PropTypes.func,
    onReset: PropTypes.func,
    onSelectGroup: PropTypes.func,
    onToggleBlockInGroup: PropTypes.func,
    onToggleBlockHidden: PropTypes.func,
    onToggleEnabled: PropTypes.func,
    onUpdateGroup: PropTypes.func,
    selectedGroupId: PropTypes.string,
    BlockPreview: PropTypes.func
};

ToolboxLayoutModal.defaultProps = {
    blocks: [],
    blocksByCategory: {},
    categoryIds: [],
    categoryColours: {},
    categorySecondaryColours: {},
    categoryNames: {},
    groups: []
};

export default injectIntl(ToolboxLayoutModal);
