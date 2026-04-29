import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import styles from './collab-loader.css';
import topBlock from '../loader/top-block.svg';
import middleBlock from '../loader/middle-block.svg';
import bottomBlock from '../loader/bottom-block.svg';

const CollabLoader = ({isLoading, message, progress}) => {
    if (!isLoading) return null;

    return (
        <div className={styles.background}>
            <div className={styles.container}>
                <div className={styles.blockAnimation}>
                    <img
                        className={styles.topBlock}
                        src={topBlock}
                        draggable={false}
                    />
                    <img
                        className={styles.middleBlock}
                        src={middleBlock}
                        draggable={false}
                    />
                    <img
                        className={styles.bottomBlock}
                        src={bottomBlock}
                        draggable={false}
                    />
                </div>

                <div className={styles.title}>
                    {message || 'Waiting for host...'}
                </div>

                <div className={styles.message}>
                    {progress > 0 ? 'Host is loading project...' : 'Please wait'}
                </div>

                <div className={styles.barOuter}>
                    <div
                        className={styles.barInner}
                        style={{width: `${progress}%`}}
                    />
                </div>

                {progress > 0 && (
                    <div className={styles.progressText}>
                        {`${progress}%`}
                    </div>
                )}
            </div>
        </div>
    );
};

CollabLoader.propTypes = {
    isLoading: PropTypes.bool,
    message: PropTypes.string,
    progress: PropTypes.number
};

CollabLoader.defaultProps = {
    isLoading: false,
    message: null,
    progress: 0
};

const mapStateToProps = state => ({
    isLoading: state.scratchGui.collaboration.isCollabLoading,
    message: state.scratchGui.collaboration.collabLoadingMessage,
    progress: state.scratchGui.collaboration.hostLoadingProgress
});

export default connect(mapStateToProps)(CollabLoader);
