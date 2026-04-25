import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {indexForPositionOnList} from './drag-utils';

const SortableHOC = function (WrappedComponent) {
    class SortableWrapper extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'setRef',
                'handleAddSortable',
                'handleRemoveSortable'
            ]);

            this.sortableRefs = [];
            this.boxes = null;
            this.ref = null;
            this.containerBox = null;
        }

        // 反向应用：将 componentDidUpdate 改回 componentWillReceiveProps
        componentWillReceiveProps (newProps) {
            if (newProps.dragInfo.dragging && !this.props.dragInfo.dragging) {
                // Drag just started, snapshot the sorted bounding boxes for sortables.
                this.boxes = this.sortableRefs.map(el => el && el.getBoundingClientRect());
                this.boxes.sort((a, b) => { // Sort top-to-bottom, left-to-right (in LTR) / right-to-left (in RTL).
                    if (a.top === b.top) return (a.left - b.left) * (newProps.isRtl ? -1 : 1);
                    return a.top - b.top;
                });
                if (!this.ref) {
                    throw new Error('The containerRef must be assigned to the sortable area');
                }
                this.containerBox = this.ref.getBoundingClientRect();
            } else if (!newProps.dragInfo.dragging && this.props.dragInfo.dragging) {
                const newIndex = this.getMouseOverIndex();
                if (newIndex !== null) {
                    // 注意：这里需要使用 this.props.dragInfo 获取旧的 drag 数据进行合并
                    this.props.onDrop(Object.assign({}, this.props.dragInfo, {newIndex}));
                }
            }
        }

        handleAddSortable (node) {
            this.sortableRefs.push(node);
        }

        handleRemoveSortable (node) {
            const index = this.sortableRefs.indexOf(node);
            this.sortableRefs = this.sortableRefs.slice(0, index)
                .concat(this.sortableRefs.slice(index + 1));
        }

        getOrdering (items, draggingIndex, newIndex) {
            let ordering = Array(this.props.items.length).fill(0)
                .map((_, i) => i);
            const isNumber = v => typeof v === 'number' && !isNaN(v);
            if (isNumber(draggingIndex) && isNumber(newIndex)) {
                ordering = ordering.slice(0, draggingIndex).concat(ordering.slice(draggingIndex + 1));
                ordering.splice(newIndex, 0, draggingIndex);
            }
            return ordering;
        }

        getMouseOverIndex () {
            let mouseOverIndex = null;
            if (this.props.dragInfo.currentOffset) {
                const {x, y} = this.props.dragInfo.currentOffset;
                const {top, left, bottom, right} = this.containerBox;
                if (x >= left && x <= right && y >= top && y <= bottom) {
                    if (this.boxes.length === 0) {
                        mouseOverIndex = 0;
                    } else {
                        mouseOverIndex = indexForPositionOnList(
                            this.props.dragInfo.currentOffset, this.boxes, this.props.isRtl);
                    }
                }
            }
            return mouseOverIndex;
        }
        setRef (el) {
            this.ref = el;
        }
        render () {
            const {dragInfo: {index: dragIndex, dragType}, items} = this.props;
            const mouseOverIndex = this.getMouseOverIndex();
            const ordering = this.getOrdering(items, dragIndex, mouseOverIndex);
            return (
                <WrappedComponent
                    containerRef={this.setRef}
                    draggingIndex={dragIndex}
                    draggingType={dragType}
                    mouseOverIndex={mouseOverIndex}
                    ordering={ordering}
                    onAddSortable={this.handleAddSortable}
                    onRemoveSortable={this.handleRemoveSortable}
                    {...this.props}
                />
            );
        }
    }

    SortableWrapper.propTypes = {
        dragInfo: PropTypes.shape({
            currentOffset: PropTypes.shape({
                x: PropTypes.number,
                y: PropTypes.number
            }),
            dragType: PropTypes.string,
            dragging: PropTypes.bool,
            index: PropTypes.number
        }),
        items: PropTypes.arrayOf(PropTypes.shape({
            url: PropTypes.string,
            name: PropTypes.string.isRequired
        })),
        onClose: PropTypes.func,
        onDrop: PropTypes.func,
        isRtl: PropTypes.bool
    };

    const mapStateToProps = state => ({
        dragInfo: state.scratchGui.assetDrag,
        isRtl: state.locales.isRtl
    });

    const mapDispatchToProps = () => ({});

    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(SortableWrapper);
};

export default SortableHOC;