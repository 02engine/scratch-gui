import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import VM from 'scratch-vm';
import AudioEngine from 'scratch-audio';

import {setProjectUnchanged} from '../reducers/project-changed';
import {
    LoadingStates,
    getIsLoadingWithId,
    onLoadedProject,
    projectError
} from '../reducers/project-state';
import log from './log';
import {restoreGitDataFromSb3} from './git/sb3-git-data.js';

/**
 * List of fonts that could be used by security prompts.
 */
const SECURITY_CRITICAL_FONTS = [
    'Helvetica Neue',
    'Helvetica',
    'Arial'
];

/*
 * Higher Order Component to manage events emitted by the VM
 * @param {React.Component} WrappedComponent component to manage VM events for
 * @returns {React.Component} connected component with vm events bound to redux
 */
const vmManagerHOC = function (WrappedComponent) {
    class VMManager extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'loadProject'
            ]);
        }
        componentDidMount () {
            if (!this.props.vm.initialized) {
                window.vm = this.props.vm;
                try {
                    this.audioEngine = new AudioEngine();
                    this.props.vm.attachAudioEngine(this.audioEngine);
                } catch (e) {
                    log.error('could not create scratch-audio', e);
                }
                for (const font of SECURITY_CRITICAL_FONTS) {
                    this.props.vm.runtime.fontManager.restrictFont(font);
                }
                this.props.vm.initialized = true;
                this.props.vm.setLocale(this.props.locale, this.props.messages);
            }
            if (!this.props.isPlayerOnly && !this.props.isStarted) {
                this.props.vm.start();
            }
        }
        componentDidUpdate (prevProps) {
            // if project is in loading state, AND fonts are loaded,
            // and they weren't both that way until now... load project!
            if (this.props.isLoadingWithId && this.props.fontsLoaded &&
                (!prevProps.isLoadingWithId || !prevProps.fontsLoaded)) {
                this.loadProject();
            }
            // Start the VM if entering editor mode with an unstarted vm
            if (!this.props.isPlayerOnly && !this.props.isStarted) {
                this.props.vm.start();
            }
        }

        /**
         * 手动清理扩展 (由于 VM 可能不包含 unloadExtension 接口)
         * @param {string} extensionId 要清理的扩展 ID
         */
        manualUnloadExtension (extensionId) {
            const vm = this.props.vm;
            const manager = vm.extensionManager;
            const runtime = vm.runtime;

            console.log('[Auto-load] 开始手动清理Wrapper:', extensionId);

            // 1. 从已加载列表移除实例
            if (manager._loadedExtensions && manager._loadedExtensions.has(extensionId)) {
                manager._loadedExtensions.delete(extensionId);
            }

            // 2. 从 Runtime 移除方块定义
            if (runtime._blockInfo) {
                const index = runtime._blockInfo.findIndex(info => info.id === extensionId);
                if (index !== -1) {
                    runtime._blockInfo.splice(index, 1);
                }
            }

            // 3. 触发 Toolbox 更新 (通知 GUI 移除分类)
            runtime.emit('EXTENSION_FIELD_UPDATE');

            console.log('[Auto-load] 手动清理完成');
        }

        loadProject () {
            // tw: stop when loading new project
            this.props.vm.quit();

            // 注意：Git数据清理交给VM的SB3反序列化机制处理
            // SB3反序列化会自动：
            // 1. 从json.meta.platform恢复Git数据（如果存在）
            // 2. 重置为默认值（如果不存在）
            // 这里不需要手动清理，避免干扰SB3的自动恢复机制

            return this.props.vm.loadProject(this.props.projectData)
                .then(() => restoreGitDataFromSb3(this.props.projectData))
                .then(() => {
                    this.props.onLoadedProject(this.props.loadingState, this.props.canSave);
                    // Wrap in a setTimeout because skin loading in
                    // the renderer can be async.
                    setTimeout(() => this.props.onSetProjectUnchanged());

                    // If the vm is not running, call draw on the renderer manually
                    // This draws the state of the loaded project with no blocks running
                    // which closely matches the 2.0 behavior, except for monitors–
                    // 2.0 runs monitors and shows updates (e.g. timer monitor)
                    // before the VM starts running other hat blocks.
                    if (!this.props.isStarted) {
                        // Wrap in a setTimeout because skin loading in
                        // the renderer can be async.
                        setTimeout(() => this.props.vm.renderer.draw());
                    }
                })
                // 自动加载远端扩展并执行清理
                .then(async () => {
                    const extensionURL = 'https://extensions.02engine.02studio.xyz/extension/wrapper.global.js';
                    const manager = this.props.vm.extensionManager;
                    
                    if (manager) {
                        // 获取加载前的所有 ID 集合
                        const beforeIds = new Set(manager._loadedExtensions?.keys?.() || []);
                        
                        // 检查扩展是否已加载，避免重复加载
                        const isAlreadyLoaded = Array.from(beforeIds).some(id => 
                            id.includes('wrapper') || id.includes('global')
                        );

                        if (!isAlreadyLoaded) {
                            try {
                                await manager.loadExtensionURL(extensionURL);
                                console.log('[Auto-load] 远端Wrapper加载成功:', extensionURL);

                                // 获取加载后的所有 ID
                                const afterIds = Array.from(manager._loadedExtensions?.keys?.() || []);
                                
                                // 找到新出现的 ID 或通过关键字匹配
                                const newId = afterIds.find(id => !beforeIds.has(id));
                                const finalId = newId || afterIds.find(id => id.includes('wrapper') || id.includes('global'));
                                
                                if (finalId) {
                                    this.manualUnloadExtension(finalId);
                                }
                            } catch (err) {
                                console.warn('[Auto-load] 远端Wrapper处理失败:', err.message);
                            }
                        }
                    }
                })
                .catch(e => {
                    this.props.onError(e);
                });
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                fontsLoaded,
                loadingState,
                locale,
                messages,
                isStarted,
                onError: onErrorProp,
                onLoadedProject: onLoadedProjectProp,
                onSetProjectUnchanged,
                projectData,
                /* eslint-enable no-unused-vars */
                isLoadingWithId: isLoadingWithIdProp,
                vm,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    isLoading={isLoadingWithIdProp}
                    vm={vm}
                    {...componentProps}
                />
            );
        }
    }

    VMManager.propTypes = {
        canSave: PropTypes.bool,
        cloudHost: PropTypes.string,
        fontsLoaded: PropTypes.bool,
        isLoadingWithId: PropTypes.bool,
        isPlayerOnly: PropTypes.bool,
        isStarted: PropTypes.bool,
        loadingState: PropTypes.oneOf(LoadingStates),
        locale: PropTypes.string,
        messages: PropTypes.objectOf(PropTypes.string),
        onError: PropTypes.func,
        onLoadedProject: PropTypes.func,
        onSetProjectUnchanged: PropTypes.func,
        projectData: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
        projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        username: PropTypes.string,
        vm: PropTypes.instanceOf(VM).isRequired
    };

    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            fontsLoaded: state.scratchGui.fontsLoaded,
            isLoadingWithId: getIsLoadingWithId(loadingState),
            locale: state.locales.locale,
            messages: state.locales.messages,
            projectData: state.scratchGui.projectState.projectData,
            projectId: state.scratchGui.projectState.projectId,
            loadingState: loadingState,
            isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
            isStarted: state.scratchGui.vmStatus.started
        };
    };

    const mapDispatchToProps = dispatch => ({
        onError: error => dispatch(projectError(error)),
        onLoadedProject: (loadingState, canSave) =>
            dispatch(onLoadedProject(loadingState, canSave, true)),
        onSetProjectUnchanged: () => dispatch(setProjectUnchanged())
    });

    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );

    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(VMManager);
};

export default vmManagerHOC;