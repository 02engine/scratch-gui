import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import styles from './sprite-layer-modal.css';

const messages = defineMessages({
    title: {
        id: 'gui.spriteLayerModal.title',
        description: 'Title of the sprite layer manager modal',
        defaultMessage: 'Manage Sprite Layers'
    },
    layer: {
        id: 'gui.spriteLayerModal.layer',
        description: 'Label for sprite layer input',
        defaultMessage: 'Layer'
    },
    drag: {
        id: 'gui.spriteLayerModal.drag',
        description: 'Accessible label for sprite layer drag handle',
        defaultMessage: 'Drag to reorder'
    }
});

const SpriteLayerModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="spriteLayerModal"
        onRequestClose={props.onCancel}
    >
        <Box className={styles.body}>
            <p className={styles.hint}>
                <FormattedMessage
                    id="gui.spriteLayerModal.hint"
                    description="Help text for sprite layer manager"
                    defaultMessage="Sprites are listed from front to back. Drag a sprite or type a layer number, then confirm to apply."
                />
            </p>
            {props.sprites.length ? (
                <div className={styles.list}>
                    {props.sprites.map((sprite, index) => (
                        <div
                            className={index === props.draggingIndex ? styles.rowDragging : styles.row}
                            draggable
                            key={sprite.id}
                            onDragEnd={props.onDragEnd}
                            onDragOver={event => props.onDragOver(event, index)}
                            onDragStart={() => props.onDragStart(index)}
                        >
                            <button
                                aria-label={props.intl.formatMessage(messages.drag)}
                                className={styles.dragHandle}
                                type="button"
                            >
                                ::
                            </button>
                            {sprite.thumbnail ? (
                                <img
                                    className={styles.thumbnail}
                                    draggable={false}
                                    src={sprite.thumbnail}
                                />
                            ) : (
                                <div className={styles.thumbnail} />
                            )}
                            <div className={styles.name}>{sprite.name}</div>
                            <label className={styles.layerField}>
                                {props.intl.formatMessage(messages.layer)}
                                <input
                                    className={styles.layerInput}
                                    max={props.sprites.length}
                                    min="1"
                                    type="number"
                                    value={sprite.layerInputValue}
                                    onChange={event => props.onChangeLayer(index, event.target.value)}
                                    onBlur={() => props.onCommitLayer(index)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter') {
                                            props.onCommitLayer(index);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.empty}>
                    <FormattedMessage
                        id="gui.spriteLayerModal.empty"
                        description="Empty state for sprite layer manager"
                        defaultMessage="There are no sprites to reorder."
                    />
                </div>
            )}
            <div className={styles.buttonRow}>
                <button
                    className={styles.cancelButton}
                    type="button"
                    onClick={props.onCancel}
                >
                    <FormattedMessage
                        id="gui.spriteLayerModal.cancel"
                        description="Cancel button in sprite layer manager"
                        defaultMessage="Cancel"
                    />
                </button>
                <button
                    className={styles.confirmButton}
                    type="button"
                    onClick={props.onConfirm}
                >
                    <FormattedMessage
                        id="gui.spriteLayerModal.confirm"
                        description="Confirm button in sprite layer manager"
                        defaultMessage="Confirm"
                    />
                </button>
            </div>
        </Box>
    </Modal>
);

SpriteLayerModal.propTypes = {
    draggingIndex: PropTypes.number,
    intl: intlShape.isRequired,
    onCancel: PropTypes.func.isRequired,
    onCommitLayer: PropTypes.func.isRequired,
    onChangeLayer: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    onDragEnd: PropTypes.func.isRequired,
    onDragOver: PropTypes.func.isRequired,
    onDragStart: PropTypes.func.isRequired,
    sprites: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        layerInputValue: PropTypes.string,
        name: PropTypes.string,
        thumbnail: PropTypes.string
    })).isRequired
};

export default injectIntl(SpriteLayerModal);
