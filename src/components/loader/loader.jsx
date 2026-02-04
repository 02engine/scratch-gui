import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import {getIsLoadingWithId} from '../../reducers/project-state';

// 02engine Logo Component
const Logo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 170 170" fill="none">
        <rect x="0" y="0" width="170" height="170" rx="57.800000000000004" fill="#004540"></rect>
        <rect x="10.20001220703125" y="18.699951171875" width="68" height="137.6999969482422" rx="34" fill="#00BAAD"></rect>
        <rect x="91.79998779296875" y="18.699951171875" width="68" height="102" rx="34" fill="#00BAAD"></rect>
        <rect x="91.79998779296875" y="91.800048828125" width="68" height="64.5999984741211" rx="32.29999923706055" fill="url(#linear_fill_22_5_0)"></rect>
        <defs>
            <linearGradient id="linear_fill_22_5_0" x1="124.39646779296875" y1="156.4000473022461" x2="124.39646779296875" y2="103.72714654640198" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#00BAAD"></stop>
                <stop offset="1" stop-color="#00BAAD" stop-opacity="0"></stop>
            </linearGradient>
        </defs>
    </svg>
);

const messages = defineMessages({
    loadingProject: {
        defaultMessage: 'Loading Project',
        description: 'Main loading message',
        id: 'gui.loader.headline'
    },
    creatingProject: {
        defaultMessage: 'Creating Project',
        description: 'Main creating message',
        id: 'gui.loader.creating'
    },
    projectData: {
        defaultMessage: 'Loading project …',
        description: 'Appears when loading project data, but not assets yet',
        id: 'tw.loader.projectData'
    },
    downloadingAssets: {
        defaultMessage: 'Downloading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project on a remote website',
        id: 'tw.loader.downloadingAssets'
    },
    loadingAssets: {
        defaultMessage: 'Loading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project file on the user\'s computer',
        id: 'tw.loader.loadingAssets'
    },
    madeByStudio: {
        defaultMessage: 'Made by 0.2Studio',
        description: 'Vertical copyright text',
        id: 'tw.loader.madeByStudio'
    },
    redefineExperience: {
        defaultMessage: 'Redefine the Designing Experience',
        description: 'Copyright slogan',
        id: 'tw.loader.redefineExperience'
    }
});

// Because progress events are fired so often during the very performance-critical loading
// process and React updates are very slow, we bypass React for updating the progress bar.

class LoaderComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAssetProgress',
            'handleProjectLoaded',
            'barInnerRef',
            'messageRef',
            'loadTips',
            'cycleTips'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.ignoreProgress = false;
        this.tips = [];
        this.currentTipIndex = 0;
        this.tipInterval = null;
    }
    componentDidMount () {
        this.handleAssetProgress(
            this.props.vm.runtime.finishedAssetRequests,
            this.props.vm.runtime.totalAssetRequests
        );
        this.props.vm.on('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
        this.loadTips();
    }
    componentWillUnmount () {
        this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded);
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
        }
    }
    loadTips () {
        fetch('/loading-tips.json')
            .then(response => response.json())
            .then(data => {
                this.tips = data;
                this.cycleTips();
                this.tipInterval = setInterval(this.cycleTips, 5000);
            })
            .catch(error => {
                console.error('Failed to load tips:', error);
            });
    }
    cycleTips () {
        if (this.tips.length === 0) return;
        this.currentTipIndex = (this.currentTipIndex + 1) % this.tips.length;
        this.forceUpdate();
    }
    handleAssetProgress (finished, total) {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        if (total === 0) {
            // Started loading a new project.
            this.barInnerEl.style.width = '0';
            this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
        } else {
            this.barInnerEl.style.width = `${finished / total * 100}%`;
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            this.messageEl.textContent = this.props.intl.formatMessage(message, {
                complete: finished,
                total
            });
        }
    }
    handleProjectLoaded () {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        this.ignoreProgress = true;
        this.props.vm.runtime.resetProgress();
    }
    barInnerRef (barInner) {
        this.barInnerEl = barInner;
    }
    messageRef (message) {
        this.messageEl = message;
    }
    render () {
        const getMessageId = () => {
            if (this.props.messageId === 'gui.loader.creating') {
                return messages.creatingProject;
            }
            return messages.loadingProject;
        };

        const currentTip = this.tips.length > 0 ? this.tips[this.currentTipIndex] : null;

        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                })}
            >
                {/* Background Section - 75% height */}
                <div className={styles.backgroundSection}>
                    <img
                        src="/images/loading-background.svg"
                        alt="02engine Background"
                        className={styles.backgroundImage}
                    />

                    {/* Vertical Text */}
                    <div className={styles.verticalText}>
                        <FormattedMessage {...messages.madeByStudio} />
                    </div>

                    {/* Progress Bar at bottom of background section */}
                    <div className={styles.progressBarContainer}>
                        <div
                            className={styles.progressBarFill}
                            ref={this.barInnerRef}
                        />
                    </div>
                </div>

                {/* Bottom Info Section - 25% height */}
                <div className={styles.bottomSection}>
                    {/* Left Side - Logo and Copyright */}
                    <div className={styles.bottomLeft}>
                        <div className={styles.logoContainer}>
                            <Logo />
                            <span className={styles.engineText}>02Engine</span>
                        </div>
                        <div className={styles.copyright}>
                            <FormattedMessage {...messages.redefineExperience} />
                        </div>
                    </div>

                    {/* Right Side - Loading Status and Random Tips */}
                    <div className={styles.bottomRight}>
                        <div
                            className={styles.loadingStatus}
                            ref={this.messageRef}
                        />
                        {currentTip && (
                            <div className={styles.randomTip}>
                                {currentTip.zh}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        on: PropTypes.func,
        off: PropTypes.func,
        runtime: PropTypes.shape({
            totalAssetRequests: PropTypes.number,
            finishedAssetRequests: PropTypes.number,
            resetProgress: PropTypes.func,
            on: PropTypes.func,
            off: PropTypes.func
        })
    })
};
LoaderComponent.defaultProps = {
    isFullScreen: false,
    messageId: 'gui.loader.headline'
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    projectTitle: state.scratchGui.projectTitle,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
