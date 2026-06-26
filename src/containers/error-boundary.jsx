import React from 'react';
import PropTypes from 'prop-types';
import CrashMessageComponent from '../components/crash-message/crash-message.jsx';
import log from '../lib/log.js';
import RestorePointAPI from '../lib/tw-restore-point-api.js';

class ErrorBoundary extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            error: null,
            errorInfo: null
        };
    }

    /**
     * Handle an error caught by this ErrorBoundary component.
     * @param {Error} error - the error that was caught.
     * @param {React.ErrorInfo} errorInfo - the React error info associated with the error.
     */
    componentDidCatch (error, errorInfo) {
        // Error object may be undefined (IE?)
        error = error || {
            stack: 'Unknown stack',
            message: 'Unknown error'
        };
        errorInfo = errorInfo || {
            componentStack: 'Unknown component stack'
        };

        // only remember the first error: later errors might just be side effects of that first one
        if (!this.state.error) {
            // store error & errorInfo for debugging
            this.setState({
                error,
                errorInfo
            }, () => {
                // Create restore point after state is updated
                this.createRestorePoint();
            });
        }

        // report every error in the console
        log.error([
            `Unhandled Error with action='${this.props.action}': ${error.stack}`,
            `Component stack: ${errorInfo.componentStack}`
        ].join('\n'));
    }

    handleBack () {
        window.history.back();
    }

    handleReload () {
        window.location.replace(window.location.origin + window.location.pathname);
    }

    formatErrorMessage () {
        let message = '';

        if (this.state.error) {
            message += `${this.state.error}`;
        } else {
            message += 'Unknown error';
        }

        if (this.state.errorInfo) {
            const firstCoupleLines = this.state
                .errorInfo
                .componentStack
                .trim()
                .split('\n')
                .slice(0, 2)
                .map(i => i.trim());
            message += `\nComponent stack: ${firstCoupleLines.join(' ')} ...`;
        }

        return message;
    }

    async createRestorePoint () {
        try {
            // Try to get vm from props, fallback to window.scratchGui
            let vm = this.props.vm;
            if (!vm && window.scratchGui && window.scratchGui.vm) {
                vm = window.scratchGui.vm;
            }
            
            if (!vm || !vm.runtime) {
                alert('VM instance or VM runtime not available - restore point could not be created');
                console.error('VM instance or VM runtime not available');
                return;
            }
            
            const runtime = vm.runtime;
            const metadata = runtime.metadata || {};
            const title = metadata.name || 'Untitled';
            
            await RestorePointAPI.createRestorePoint(vm, title, RestorePointAPI.TYPE_MANUAL);
            alert('Data has been saved to restore point');
        } catch (error) {
            alert('Failed to create restore point: ' + error.message);
            console.error('Failed to create restore point:', error);
        }
    }

    render () {
        if (this.state.error) {
            return (
                <CrashMessageComponent
                    errorMessage={this.formatErrorMessage()}
                    onReload={this.handleReload}
                />
            );
        }
        return this.props.children;
    }
}

ErrorBoundary.propTypes = {
    action: PropTypes.string.isRequired, // Used for defining tracking action
    children: PropTypes.node,
    vm: PropTypes.object // Optional vm instance for creating restore points
};

export default ErrorBoundary;