import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {
    defaultProjectId,
    getIsFetchingWithoutId,
    setProjectId
} from '../reducers/project-state';

/* Higher Order Component to get the project id from location.hash
 * @param {React.Component} WrappedComponent: component to render
 * @returns {React.Component} component with hash parsing behavior
 */
const HashParserHOC = function (WrappedComponent) {
    class HashParserComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleHashChange'
            ]);
        }
        componentDidMount () {
            window.addEventListener('hashchange', this.handleHashChange);
            this.handleHashChange();
        }
        componentDidUpdate (prevProps) {
            // if we are newly fetching a non-hash project...
            if (this.props.isFetchingWithoutId && !prevProps.isFetchingWithoutId) {
                // ...clear the hash from the url
                history.pushState('new-project', 'new-project',
                    window.location.pathname + window.location.search);
            }
        }
        componentWillUnmount () {
            window.removeEventListener('hashchange', this.handleHashChange);
        }
handleHashChange () {
    const hashMatch = window.location.hash.match(/#([^?]+)/);
    let hashProjectId;
    
    if (hashMatch === null) {
        hashProjectId = defaultProjectId;
    } else {
        // 提取#后面的内容，但排除可能存在的查询参数部分
        const hashContent = hashMatch[1];
        // 如果包含问号，只取问号之前的部分
        const projectIdPart = hashContent.split('?')[0];
        hashProjectId = projectIdPart;
    }
    
    this.props.setProjectId(hashProjectId.toString());
}
        render () {
            const {
                /* eslint-disable no-unused-vars */
                isFetchingWithoutId: isFetchingWithoutIdProp,
                reduxProjectId,
                setProjectId: setProjectIdProp,
                /* eslint-enable no-unused-vars */
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }
    HashParserComponent.propTypes = {
        isFetchingWithoutId: PropTypes.bool,
        reduxProjectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        setProjectId: PropTypes.func
    };
    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            isFetchingWithoutId: getIsFetchingWithoutId(loadingState),
            reduxProjectId: state.scratchGui.projectState.projectId
        };
    };
    const mapDispatchToProps = dispatch => ({
        setProjectId: projectId => {
            dispatch(setProjectId(projectId));
        }
    });
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(HashParserComponent);
};

export {
    HashParserHOC as default
};
