import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';

import ControlsComponent from '../components/controls/controls.jsx';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlagClick',
            'handleStopAllClick',
            'handleCrashTrigger'
        ]);
        this.state = {
            shouldCrash: false
        };
        
        // Track pressed keys for the secret crash trigger
        this.pressedKeys = new Set();
        
        // Add keyboard listeners for crash trigger
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }
    
    handleKeyDown (event) {
        this.pressedKeys.add(event.key);
        
        // Trigger crash on Ctrl+Shift+Alt+Z+0 simultaneously
        // Requires pressing 5 keys at once with both hands in extremely awkward positions:
        // - Left hand: Ctrl + Shift + Alt + Z (middle-left area of keyboard)
        // - Right hand: 0 (rightmost key on number row)
        // The hand positions required make this almost impossible to trigger accidentally
        const hasCtrl = event.ctrlKey || event.metaKey;
        const hasShift = event.shiftKey;
        const hasAlt = event.altKey;
        const hasZ = this.pressedKeys.has('z') || this.pressedKeys.has('Z');
        const has0 = this.pressedKeys.has('0');
        
        if (hasCtrl && hasShift && hasAlt && hasZ && has0) {
            event.preventDefault();
            this.handleCrashTrigger();
        }
    }
    
    handleKeyUp (event) {
        this.pressedKeys.delete(event.key);
    }
    
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }
    
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }
    
    handleCrashTrigger () {
        // Set state to trigger crash on next render
        this.setState({shouldCrash: true});
    }
    handleGreenFlagClick (e) {
        e.preventDefault();
        // tw: implement alt+click and right click to toggle FPS
        if (e.shiftKey || e.altKey || e.type === 'contextmenu') {
            if (e.shiftKey) {
                this.props.vm.setTurboMode(!this.props.turbo);
            }
            if (e.altKey || e.type === 'contextmenu') {
                if (this.props.framerate === 30) {
                    this.props.vm.setFramerate(60);
                } else {
                    this.props.vm.setFramerate(30);
                }
            }
        } else {
            if (!this.props.isStarted) {
                this.props.vm.start();
            }
            this.props.vm.greenFlag();
        }
    }
    handleStopAllClick (e) {
        e.preventDefault();
        this.props.vm.stopAll();
    }
    render () {
        const {
            vm, // eslint-disable-line no-unused-vars
            isStarted, // eslint-disable-line no-unused-vars
            projectRunning,
            turbo,
            ...props
        } = this.props;
        
        // Trigger crash when state is set
        if (this.state.shouldCrash) {
            // This will cause a TypeError during render
            return undefined.crashNow;
        }
        
        return (
            <ControlsComponent
                {...props}
                active={projectRunning && isStarted}
                turbo={turbo}
                onGreenFlagClick={this.handleGreenFlagClick}
                onStopAllClick={this.handleStopAllClick}
            />
        );
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    framerate: PropTypes.number.isRequired,
    interpolation: PropTypes.bool.isRequired,
    isSmall: PropTypes.bool,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.started,
    projectRunning: state.scratchGui.vmStatus.running,
    framerate: state.scratchGui.tw.framerate,
    interpolation: state.scratchGui.tw.interpolation,
    turbo: state.scratchGui.vmStatus.turbo
});
// no-op function to prevent dispatch prop being passed to component
const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(Controls);
