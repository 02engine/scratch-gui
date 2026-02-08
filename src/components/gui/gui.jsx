import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';

import DraggableWindow from '../draggable-window/draggable-window.jsx';
import MinimizedBar from '../draggable-window/minimized-bar.jsx';
import GitCommitModal from '../git-commit-modal/git-commit-modal.jsx';
import GitQuickModal from '../git-quick-modal/git-quick-modal.jsx';
import GitHubOAuthModal from '../github-oauth-modal/github-oauth-modal.jsx';
import ProjectExporter from '../../lib/project-exporter.js';
import githubApi from '../../lib/github-api.js';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import BrowserModal from '../browser-modal/browser-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import TWUsernameModal from '../../containers/tw-username-modal.jsx';
import TWSettingsModal from '../../containers/tw-settings-modal.jsx';
import TWSecurityManager from '../../containers/tw-security-manager.jsx';
import TWCustomExtensionModal from '../../containers/tw-custom-extension-modal.jsx';
import TWRestorePointManager from '../../containers/tw-restore-point-manager.jsx';
import TWFontsModal from '../../containers/tw-fonts-modal.jsx';
import TWUnknownPlatformModal from '../../containers/tw-unknown-platform-modal.jsx';
import TWInvalidProjectModal from '../../containers/tw-invalid-project-modal.jsx';

import {STAGE_SIZE_MODES, FIXED_WIDTH, UNCONSTRAINED_NON_STAGE_WIDTH} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import {Theme} from '../../lib/themes';

import {isRendererSupported, isBrowserSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from '!../../lib/tw-recolor/build!./icon--code.svg';
import costumesIcon from '!../../lib/tw-recolor/build!./icon--costumes.svg';
import soundsIcon from '!../../lib/tw-recolor/build!./icon--sounds.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

const getFullscreenBackgroundColor = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('fullscreen-background')) {
        return params.get('fullscreen-background');
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return '#111';
    }
    return 'white';
};

const fullscreenBackgroundColor = getFullscreenBackgroundColor();

const GUIComponent = props => {
    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        customStageSize,
        enableCommunity,
        intl,
        isCreating,
        isEmbedded,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isWindowFullScreen,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onClickAddonSettings,
        onClickDesktopSettings,
        onClickNewWindow,
        onClickPackager,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onOpenCustomExtensionModal,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        securityManager,
        showComingSoon,
        showOpenFilePicker,
        showSaveFilePicker,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        usernameModalVisible,
        settingsModalVisible,
        customExtensionModalVisible,
        fontsModalVisible,
        unknownPlatformModalVisible,
        invalidProjectModalVisible,
        vm,
        ...componentProps
    } = omit(props, 'dispatch');

    const [stageWindowPosition, setStageWindowPosition] = React.useState({x: 350, y: 200}); //其实没什么实际含义
    const [stageWindowSize, setStageWindowSize] = React.useState({width: 485, height: 483});
    const [stageWindowMinimized, setStageWindowMinimized] = React.useState(false);
    const [targetPaneWindowPosition, setTargetPaneWindowPosition] = React.useState({x: 400, y: 275}); //也没什么含义
    const [targetPaneWindowSize, setTargetPaneWindowSize] = React.useState({width: 485, height: 447});
    const [targetPaneWindowMinimized, setTargetPaneWindowMinimized] = React.useState(false);

    // Git 状态跟踪
    const [gitRepositoryExists, setGitRepositoryExists] = React.useState(false);
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    // Git 提交相关状态
    const [isGitCommitModalOpen, setIsGitCommitModalOpen] = React.useState(false);
    const [projectData, setProjectData] = React.useState(null);

    // Git 快捷操作相关状态
    const [isGitQuickModalOpen, setIsGitQuickModalOpen] = React.useState(false);
    const [gitQuickModalType, setGitQuickModalType] = React.useState('commit');

    // OAuth 认证相关状态
    const [isOAuthModalOpen, setIsOAuthModalOpen] = React.useState(false);

    // 处理 Git 提交按钮点击
    const handleClickGitCommit = React.useCallback(async () => {
        // 检查是否已认证
        if (!githubApi.hasAnyToken()) {
            // 如果没有认证，显示 OAuth 模态框
            setIsOAuthModalOpen(true);
            return;
        }

        try {
            // 导出项目数据
            const sb3Data = await ProjectExporter.exportToSB3(vm);
            setProjectData(sb3Data);
            setIsGitCommitModalOpen(true);
        } catch (error) {
            console.error('Failed to export project for Git commit:', error);
            // 可以在这里添加错误提示
        }
    }, [vm]);

    // 处理 Git 提交模态框关闭
    const handleCloseGitCommitModal = React.useCallback(() => {
        setIsGitCommitModalOpen(false);
        setProjectData(null);
    }, []);

    // 处理 Git 提交成功
    const handleGitCommitSuccess = React.useCallback((result) => {
        console.log('✅ [Git] Commit successful:', result);

        // 保存仓库信息到 VM
        if (vm && vm.runtime && vm.runtime.platform) {
            console.log('💾 [Git] Saving repository data to VM...');
            if (!vm.runtime.platform.git) {
                vm.runtime.platform.git = {
                    repository: null,
                    lastCommit: null,
                    lastFetch: null
                };
            }

            // 更新 Git 数据
            vm.runtime.platform.git.repository = result.repository;
            vm.runtime.platform.git.lastCommit = new Date().toISOString();

            console.log('📋 [Git] Updated VM git data:', vm.runtime.platform.git);

            // 立即更新 React 状态
            setGitRepositoryExists(true);

            // Git数据会自动通过VM的SB3序列化机制保存到项目文件中
            // 当项目保存时，Git数据会自动序列化到SB3文件的meta.platform.git中
            console.log('💾 [Git] Git state will be automatically saved by VM SB3 serialization');

            console.log('🔄 [Git] Git state updated, repository exists:', !!vm.runtime.platform.git.repository);
        }

        handleCloseGitCommitModal();
    }, [handleCloseGitCommitModal, vm]);

    // 处理 Git 获取成功
    const handleGitFetchSuccess = React.useCallback(async (result) => {
        console.log('🎉 [Git] Fetch successful:', result);

        // 保存仓库信息到 VM
        if (vm && vm.runtime && vm.runtime.platform) {
            console.log('💾 [Git] Saving repository data to VM...');
            if (!vm.runtime.platform.git) {
                vm.runtime.platform.git = {
                    repository: null,
                    lastCommit: null,
                    lastFetch: null
                };
            }

            // 更新 Git 数据
            vm.runtime.platform.git.repository = result.repository;
            vm.runtime.platform.git.lastFetch = new Date().toISOString();

            console.log('📋 [Git] Updated VM git data:', vm.runtime.platform.git);

            // 立即更新 React 状态
            setGitRepositoryExists(true);

            // Git数据会自动通过VM的SB3序列化机制保存到项目文件中
            // 当项目保存时，Git数据会自动序列化到SB3文件的meta.platform.git中
            console.log('💾 [Git] Git state will be automatically saved by VM SB3 serialization');

            // 如果有项目数据，加载到 VM
            if (result.projectData) {
                try {
                    await vm.loadProject(result.projectData);
                    console.log('✅ [Git] Project loaded successfully');

                    // 项目加载完成后再次确保 Git 状态正确
                    setTimeout(() => {
                        if (vm.runtime.platform.git.repository) {
                            setGitRepositoryExists(true);
                        }
                    }, 100);
                } catch (error) {
                    console.error('❌ [Git] Failed to load project:', error);
                }
            }

            console.log('🔄 [Git] Git state updated after fetch, repository exists:', !!vm.runtime.platform.git.repository);
        }

        handleCloseGitCommitModal();
    }, [handleCloseGitCommitModal, vm]);

    
    // 检查是否有保存的 Git 仓库和 Token
    const hasGitRepository = React.useCallback(() => {
        return gitRepositoryExists;
    }, [gitRepositoryExists]);

    const hasGitToken = React.useCallback(() => {
        return githubApi.hasAnyToken();
    }, []);

    // 更新 Git 状态的函数
    const updateGitRepositoryState = React.useCallback(() => {
        if (!vm || !vm.runtime || !vm.runtime.platform) {
            setGitRepositoryExists(false);
            return;
        }

        // 确保 git 对象存在
        if (!vm.runtime.platform.git) {
            vm.runtime.platform.git = {
                repository: null,
                lastCommit: null,
                lastFetch: null
            };
        }

        const hasRepo = !!vm.runtime.platform.git.repository;
        console.log('🔄 [Git] Updating repository state:', {
            hasRepository: hasRepo,
            repository: vm.runtime.platform.git.repository,
            platform: vm.runtime.platform
        });
        setGitRepositoryExists(hasRepo);
    }, [vm]);

    // 处理 Git 快捷操作
    const handleGitQuickAction = React.useCallback((type) => {
        setGitQuickModalType(type);
        setIsGitQuickModalOpen(true);
    }, []);

    // 关闭 Git 快捷模态框
    const handleCloseGitQuickModal = React.useCallback(() => {
        setIsGitQuickModalOpen(false);
    }, []);

    // 处理 Git 快捷操作成功
    const handleGitQuickSuccess = React.useCallback((result) => {
        console.log('✅ [Git] Quick action successful:', result);

        // 如果是 fetch 操作，更新 Git 数据
        if (result && result.repository && vm && vm.runtime && vm.runtime.platform) {
            console.log('💾 [Git] Updating fetch data to VM...');
            if (!vm.runtime.platform.git) {
                vm.runtime.platform.git = {
                    repository: null,
                    lastCommit: null,
                    lastFetch: null
                };
            }

            // 更新 Git 数据
            vm.runtime.platform.git.repository = result.repository;
            vm.runtime.platform.git.lastFetch = new Date().toISOString();

            console.log('📋 [Git] Updated VM git data after fetch:', vm.runtime.platform.git);

            // 立即更新 React 状态
            setGitRepositoryExists(true);

            // Git数据会自动通过VM的SB3序列化机制保存到项目文件中
            // 当项目保存时，Git数据会自动序列化到SB3文件的meta.platform.git中
            console.log('💾 [Git] Git state will be automatically saved by VM SB3 serialization');

            console.log('🔄 [Git] Git state updated after quick action, repository exists:', !!vm.runtime.platform.git.repository);
        }

        handleCloseGitQuickModal();
    }, [handleCloseGitQuickModal, vm]);

    // 处理 OAuth 认证成功
    const handleOAuthSuccess = React.useCallback((result) => {
        console.log('✅ [OAuth] Authentication successful:', result);
        setIsOAuthModalOpen(false);

        // 认证成功后，自动打开 Git 提交模态框
        setTimeout(() => {
            handleClickGitCommit();
        }, 100);
    }, []);

    // 处理 OAuth 认证错误
    const handleOAuthError = React.useCallback((error) => {
        console.error('❌ [OAuth] Authentication failed:', error);
        // 错误已在模态框中显示
    }, []);

    // 处理 OAuth 模态框关闭
    const handleCloseOAuthModal = React.useCallback(() => {
        setIsOAuthModalOpen(false);
    }, []);



    // 确保 VM 初始化时 git 对象存在，并立即检测Git状态
    React.useEffect(() => {
        if (vm && vm.runtime && vm.runtime.platform) {
            if (!vm.runtime.platform.git) {
                vm.runtime.platform.git = {
                    repository: null,
                    lastCommit: null,
                    lastFetch: null
                };
            }

            // 立即检测Git状态
            const hasRepo = !!vm.runtime.platform.git.repository;
            console.log('🔍 [Git] Initial Git state check:', {
                hasRepository: hasRepo,
                repository: vm.runtime.platform.git.repository
            });
            setGitRepositoryExists(hasRepo);
        }
    }, [vm]);

    // 监听项目加载完成事件，恢复 Git 数据
    React.useEffect(() => {
        if (!vm) return;

        // Git状态检测函数 - 依赖VM的SB3反序列化机制
        const detectAndRestoreGitState = () => {
            console.log('🔍 [Git] Checking Git state from VM (restored by SB3 deserialization)...');

            try {
                if (!vm || !vm.runtime || !vm.runtime.platform) {
                    console.warn('❌ [Git] VM runtime not available');
                    setGitRepositoryExists(false);
                    return false;
                }

                // 确保 git 对象存在
                if (!vm.runtime.platform.git) {
                    vm.runtime.platform.git = {
                        repository: null,
                        lastCommit: null,
                        lastFetch: null
                    };
                }

                // 检查 VM 中已经由SB3反序列化恢复的Git数据
                const currentGitState = vm.runtime.platform.git;
                const hasRepository = !!(currentGitState && currentGitState.repository);

                console.log('📊 [Git] Current VM Git state (restored from SB3):', {
                    repository: currentGitState.repository,
                    lastCommit: currentGitState.lastCommit,
                    lastFetch: currentGitState.lastFetch,
                    hasRepository: hasRepository
                });

                if (hasRepository) {
                    console.log('✅ [Git] Git repository found in VM:', currentGitState.repository);
                    setGitRepositoryExists(true);
                    return true;
                }

                console.log('📂 [Git] No Git repository found in current project');

                // Git状态完全由VM的SB3反序列化机制管理
                // 如果VM中没有Git仓库信息，说明当前项目确实没有Git信息
                setGitRepositoryExists(false);
                return false;

            } catch (error) {
                console.error('❌ [Git] Error in Git state detection:', error);
                setGitRepositoryExists(false);
                return false;
            }
        };

        // 从项目元数据中提取Git信息
        const extractGitFromProjectMetadata = () => {
            try {
                // 检查 vm.runtime.meta 是否包含 Git 信息
                if (vm.runtime.meta && vm.runtime.meta.platform && vm.runtime.meta.platform.git) {
                    const gitData = vm.runtime.meta.platform.git;
                    console.log('📄 [Git] Found Git data in VM runtime meta:', gitData);
                    return {
                        repository: gitData.repository || null,
                        lastCommit: gitData.lastCommit || null,
                        lastFetch: gitData.lastFetch || null
                    };
                }

                // 尝试通过序列化获取项目数据
                try {
                    const projectData = vm.runtime.serialize();
                    if (projectData && projectData.meta && projectData.meta.platform && projectData.meta.platform.git) {
                        const gitData = projectData.meta.platform.git;
                        console.log('📄 [Git] Found Git data in serialized project:', gitData);
                        return {
                            repository: gitData.repository || null,
                            lastCommit: gitData.lastCommit || null,
                            lastFetch: gitData.lastFetch || null
                        };
                    }
                } catch (serializeError) {
                    console.warn('⚠️ [Git] Could not serialize project for Git data extraction:', serializeError);
                }

                // 尝试手动构建项目数据
                if (vm.runtime.targets && vm.runtime.targets.length > 0) {
                    const stage = vm.runtime.targetForStage;
                    if (stage && stage.constructor && stage.constructor.name === 'Stage') {
                        try {
                            const projectData = {
                                targets: vm.runtime.targets.map(target => target.toJSON()),
                                meta: {
                                    ...vm.runtime.meta,
                                    platform: vm.runtime.platform
                                }
                            };

                            if (projectData.meta && projectData.meta.platform && projectData.meta.platform.git) {
                                const gitData = projectData.meta.platform.git;
                                console.log('📄 [Git] Found Git data in manually constructed project:', gitData);
                                return {
                                    repository: gitData.repository || null,
                                    lastCommit: gitData.lastCommit || null,
                                    lastFetch: gitData.lastFetch || null
                                };
                            }
                        } catch (manualError) {
                            console.warn('⚠️ [Git] Could not manually construct project for Git data extraction:', manualError);
                        }
                    }
                }

                return null;

            } catch (error) {
                console.error('❌ [Git] Error extracting Git from project metadata:', error);
                return null;
            }
        };

        // Git状态恢复完全依赖VM的SB3反序列化机制
        // 不需要从localStorage恢复，Git数据会自动从SB3文件的meta.platform.git恢复
        const tryRestoreFromStorage = () => {
            // Git数据已经通过VM的SB3反序列化自动恢复到vm.runtime.platform.git
            // 不需要任何额外的恢复操作
            console.log('📂 [Git] Git state is restored by VM SB3 deserialization');
            return null; // 不使用localStorage，返回null
        };

        // Git状态会自动通过VM的SB3序列化机制保存到项目文件中
        // 不需要额外的localStorage存储，Git数据会随SB3文件一起保存和加载
        const saveGitStateToStorage = (gitState) => {
            // Git数据已经通过vm.runtime.platform.git存储在VM中
            // 当项目保存时，会自动序列化到SB3文件的meta.platform.git中
            // 当项目加载时，会自动从SB3文件的meta.platform.git反序列化到vm.runtime.platform.git
            console.log('💾 [Git] Git state is managed by VM SB3 serialization:', gitState);
            // 不需要任何额外的存储操作
        };

        // 项目加载完成事件处理
        const handleProjectLoaded = () => {
            console.log('🚀 [Git] Project loaded, checking Git state immediately...');

            // 立即检测Git状态
            setTimeout(() => {
                console.log('🔍 [Git] Checking Git state after project load...');
                detectAndRestoreGitState();
            }, 100); // 短暂延迟确保VM准备就绪
        };

        // VM准备完成事件处理
        const handleVmReady = () => {
            console.log('🟢 [Git] VM ready, performing Git state detection...');

            // 延迟检测以确保项目数据已加载
            setTimeout(() => {
                detectAndRestoreGitState();
            }, 200);
        };

        // 项目变更事件处理
        const handleProjectChanged = () => {
            console.log('🔄 [Git] Project changed, updating Git state...');

            // 延迟检测以确保变更已处理
            setTimeout(() => {
                detectAndRestoreGitState();
            }, 150);
        };

        // 监听VM事件
        vm.on('PROJECT_LOADED', handleProjectLoaded);
        vm.on('VM_LOADED', handleVmReady);
        vm.on('PROJECT_CHANGED', handleProjectChanged);

        // Git状态变更监听器
        const gitStateMonitor = setInterval(() => {
            if (vm && vm.runtime && vm.runtime.platform && vm.runtime.platform.git) {
                const currentRepo = vm.runtime.platform.git.repository;
                const hasRepo = !!currentRepo;

                // 如果状态发生变化，更新React状态
                if (hasRepo !== gitRepositoryExists) {
                    console.log('🔄 [Git] Git state changed detected:', {
                        hasRepository: hasRepo,
                        repository: currentRepo
                    });
                    setGitRepositoryExists(hasRepo);

                    // Git数据会自动通过VM的SB3序列化机制保存
                    // 当项目保存时，Git数据会自动序列化到SB3文件的meta.platform.git中
                    // 不需要额外的localStorage保存操作
                    if (hasRepo) {
                        console.log('💾 [Git] Git state will be saved by VM SB3 serialization when project is saved');
                    }
                }
            }
        }, 1000); // 每秒检查一次

        return () => {
            vm.off('PROJECT_LOADED', handleProjectLoaded);
            vm.off('VM_LOADED', handleVmReady);
            vm.off('PROJECT_CHANGED', handleProjectChanged);
            clearInterval(gitStateMonitor);
        };
    }, [vm, gitRepositoryExists]);

    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    // 全局最小化窗口栏数据
    const minimizedWindows = [];
    if (stageWindowMinimized) {
        minimizedWindows.push({
            windowId: 'stage',
            title: 'Stage',
            icon: (
                <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
                    <rect x="2" y="2" width="16" height="16" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                    <rect x="6" y="6" width="8" height="8" fill="white"/>
                </svg>
            ),
            onRestore: () => setStageWindowMinimized(false)
        });
    }
    if (targetPaneWindowMinimized) {
        minimizedWindows.push({
            windowId: 'targets',
            title: 'Sprites',
            icon: (
                <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
                    <circle cx="10" cy="6" r="3" fill="white"/>
                    <circle cx="5" cy="12" r="2.5" fill="white"/>
                    <circle cx="15" cy="12" r="2.5" fill="white"/>
                </svg>
            ),
            onRestore: () => setTargetPaneWindowMinimized(false)
        });
    }

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    const unconstrainedWidth = (
        UNCONSTRAINED_NON_STAGE_WIDTH +
        FIXED_WIDTH +
        Math.max(0, customStageSize.width - FIXED_WIDTH)
    );
    return (<MediaQuery minWidth={unconstrainedWidth}>{isUnconstrained => {
        const stageSize = resolveStageSize(stageSizeMode, isUnconstrained);

        const alwaysEnabledModals = (
            <React.Fragment>
                <TWSecurityManager securityManager={securityManager} />
                <TWRestorePointManager />
                {usernameModalVisible && <TWUsernameModal />}
                {settingsModalVisible && <TWSettingsModal />}
                {customExtensionModalVisible && <TWCustomExtensionModal />}
                {fontsModalVisible && <TWFontsModal />}
                {unknownPlatformModalVisible && <TWUnknownPlatformModal />}
                {invalidProjectModalVisible && <TWInvalidProjectModal />}
            </React.Fragment>
        );

        return isPlayerOnly ? (
            <React.Fragment>
                {/* TW: When the window is fullscreen, use an element to display the background color */}
                {/* The default color for transparency is inconsistent between browsers and there isn't an existing */}
                {/* element for us to style that fills the entire screen. */}
                {isWindowFullScreen ? (
                    <div
                        className={styles.fullscreenBackground}
                        style={{
                            backgroundColor: fullscreenBackgroundColor
                        }}
                    />
                ) : null}
                <StageWrapper
                    isFullScreen={isFullScreen}
                    isEmbedded={isEmbedded}
                    isRendererSupported={isRendererSupported()}
                    isRtl={isRtl}
                    loading={loading}
                    stageSize={STAGE_SIZE_MODES.full}
                    vm={vm}
                >
                    {alertsVisible ? (
                        <Alerts className={styles.alertsContainer} />
                    ) : null}
                </StageWrapper>
                {alwaysEnabledModals}
            </React.Fragment>
        ) : (
            <Box
                className={styles.pageWrapper}
                dir={isRtl ? 'rtl' : 'ltr'}
                style={{
                    minWidth: 1024 + Math.max(0, customStageSize.width - 480),
                    minHeight: 640 + Math.max(0, customStageSize.height - 360)
                }}
                {...componentProps}
            >
                {alwaysEnabledModals}
                {telemetryModalVisible ? (
                    <TelemetryModal
                        isRtl={isRtl}
                        isTelemetryEnabled={isTelemetryEnabled}
                        onCancel={onTelemetryModalCancel}
                        onOptIn={onTelemetryModalOptIn}
                        onOptOut={onTelemetryModalOptOut}
                        onRequestClose={onRequestCloseTelemetryModal}
                        onShowPrivacyPolicy={onShowPrivacyPolicy}
                    />
                ) : null}
                {loading ? (
                    <Loader isFullScreen />
                ) : null}
                {isCreating ? (
                    <Loader
                        isFullScreen
                        messageId="gui.loader.creating"
                    />
                ) : null}
                {isBrowserSupported() ? null : (
                    <BrowserModal
                        isRtl={isRtl}
                        onClickDesktopSettings={onClickDesktopSettings}
                    />
                )}
                {tipsLibraryVisible ? (
                    <TipsLibrary />
                ) : null}
                {cardsVisible ? (
                    <Cards />
                ) : null}
                {alertsVisible ? (
                    <Alerts className={styles.alertsContainer} />
                ) : null}
                {connectionModalVisible ? (
                    <ConnectionModal
                        vm={vm}
                    />
                ) : null}
                {costumeLibraryVisible ? (
                    <CostumeLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseCostumeLibrary}
                    />
                ) : null}
                {backdropLibraryVisible ? (
                    <BackdropLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseBackdropLibrary}
                    />
                ) : null}
                <MenuBar
                    accountNavOpen={accountNavOpen}
                    authorId={authorId}
                    authorThumbnailUrl={authorThumbnailUrl}
                    authorUsername={authorUsername}
                    canChangeLanguage={canChangeLanguage}
                    canChangeTheme={canChangeTheme}
                    canCreateCopy={canCreateCopy}
                    canCreateNew={canCreateNew}
                    canEditTitle={canEditTitle}
                    canManageFiles={canManageFiles}
                    canRemix={canRemix}
                    canSave={canSave}
                    canShare={canShare}
                    className={classNames(styles.menuBarPosition, {
                        [styles.fullscreenMenuBar]: isFullScreen
                    })}
                    enableCommunity={enableCommunity}
                    isShared={isShared}
                    isTotallyNormal={isTotallyNormal}
                    logo={logo}
                    renderLogin={renderLogin}
                    showComingSoon={showComingSoon}
                    showOpenFilePicker={showOpenFilePicker}
                    showSaveFilePicker={showSaveFilePicker}
                    onClickAbout={onClickAbout}
                    onClickAccountNav={onClickAccountNav}
                    onClickAddonSettings={onClickAddonSettings}
                    onClickDesktopSettings={onClickDesktopSettings}
                    onClickNewWindow={onClickNewWindow}
                    onClickPackager={onClickPackager}
                    onClickLogo={onClickLogo}
                    onCloseAccountNav={onCloseAccountNav}
                    onLogOut={onLogOut}
                    onOpenRegistration={onOpenRegistration}
                    onProjectTelemetryEvent={onProjectTelemetryEvent}
                    onSeeCommunity={onSeeCommunity}
                    onShare={onShare}
                    onStartSelectingFileUpload={onStartSelectingFileUpload}
                    onToggleLoginOpen={onToggleLoginOpen}
                    onClickGitCommit={handleClickGitCommit}
                    onGitQuickAction={handleGitQuickAction}
                    showGitQuickButtons={hasGitRepository()}
                />


                <Box className={styles.bodyWrapper}>
                    <Box className={styles.flexWrapper}>
                        <Box className={styles.editorWrapper}>
                            <Tabs
                                forceRenderTabPanel
                                className={tabClassNames.tabs}
                                selectedIndex={activeTabIndex}
                                selectedTabClassName={tabClassNames.tabSelected}
                                selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                onSelect={onActivateTab}
                            >
                                <TabList className={tabClassNames.tabList}>
                                    <Tab className={tabClassNames.tab}>
                                        <img
                                            draggable={false}
                                            src={codeIcon()}
                                        />
                                        <FormattedMessage
                                            defaultMessage="Code"
                                            description="Button to get to the code panel"
                                            id="gui.gui.codeTab"
                                        />
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateCostumesTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={costumesIcon()}
                                        />
                                        {targetIsStage ? (
                                            <FormattedMessage
                                                defaultMessage="Backdrops"
                                                description="Button to get to the backdrops panel"
                                                id="gui.gui.backdropsTab"
                                            />
                                        ) : (
                                            <FormattedMessage
                                                defaultMessage="Costumes"
                                                description="Button to get to the costumes panel"
                                                id="gui.gui.costumesTab"
                                            />
                                        )}
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateSoundsTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={soundsIcon()}
                                        />
                                        <FormattedMessage
                                            defaultMessage="Sounds"
                                            description="Button to get to the sounds panel"
                                            id="gui.gui.soundsTab"
                                        />
                                    </Tab>
                                </TabList>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    <Box className={styles.blocksWrapper}>
                                        <Blocks
                                            key={`${blocksId}/${theme.id}`}
                                            canUseCloud={canUseCloud}
                                            grow={1}
                                            isVisible={blocksTabVisible}
                                            options={{
                                                media: `${basePath}static/${theme.getBlocksMediaFolder()}/`
                                            }}
                                            stageSize={stageSize}
                                            onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                                            theme={theme}
                                            vm={vm}
                                        />
                                    </Box>
                                    <Box className={styles.extensionButtonContainer}>
                                        <button
                                            className={styles.extensionButton}
                                            title={intl.formatMessage(messages.addExtension)}
                                            onClick={onExtensionButtonClick}
                                        >
                                            <img
                                                className={styles.extensionButtonIcon}
                                                draggable={false}
                                                src={addExtensionIcon}
                                            />
                                        </button>
                                    </Box>
                                    <Box className={styles.watermark}>
                                        <Watermark />
                                    </Box>
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {costumesTabVisible ? <CostumeTab
                                        vm={vm}
                                    /> : null}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                                </TabPanel>
                            </Tabs>
                            {backpackVisible ? (
                                <Backpack host={backpackHost} />
                            ) : null}
                        </Box>

                        {props.customUI ? (
                        <>
                            {!stageWindowMinimized && (
                                <DraggableWindow
                                    windowId="stage"
                                    title="Stage"
                                    defaultPosition={stageWindowPosition}
                                    defaultSize={{width: stageWindowSize[0]+4, height: stageWindowSize[1]+75}}
                                    minSize={{width: 74, height: 25}}
                                    maxSize={{width: 960+4, height: 720+75}}
                                    allowResize={true}
                                    allowMaximize={false}
                                    onDragStop={(id, position) => setStageWindowPosition(position)}
                                    onResizeStop={(id, size) => setStageWindowSize(size)}
                                    onMinimizeToggle={(id, minimized) => setStageWindowMinimized(minimized)}
                                    zIndex={100}
                                    enableStatePersistence={true}
                                >
                                    <StageWrapper
                                        isFullScreen={isFullScreen}
                                        isRendererSupported={isRendererSupported()}
                                        isRtl={isRtl}
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                </DraggableWindow>
                            )}
                            {!targetPaneWindowMinimized && (
                                <DraggableWindow
                                    windowId="targets"
                                    title="Sprites"
                                    defaultPosition={targetPaneWindowPosition}
                                    defaultSize={targetPaneWindowSize}
                                    minSize={{width: 471, height: 211}}
                                    maxSize={{width: 600, height: 800}}
                                    onDragStop={(id, position) => setTargetPaneWindowPosition(position)}
                                    onResizeStop={(id, size) => setTargetPaneWindowSize(size)}
                                    onMinimizeToggle={(id, minimized) => setTargetPaneWindowMinimized(minimized)}
                                    zIndex={100}
                                    enableStatePersistence={true}
                                >
                                    <TargetPane
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                </DraggableWindow>
                            )}
                {/* 全局唯一最小化栏 */}
                <MinimizedBar windows={minimizedWindows} />
                        </>
                        ) : (
                        /* 原版内嵌布局（使用原始样式容器） */
                        <Box className={styles.stageAndTargetWrapper}>
                            <StageWrapper
                                isFullScreen={isFullScreen}
                                isRendererSupported={isRendererSupported()}
                                isRtl={isRtl}
                                loading={loading}
                                stageSize={stageSize}
                                vm={vm}
                            >
                                {alertsVisible ? (
                                    <Alerts className={styles.alertsContainer} />
                                ) : null}
                            </StageWrapper>
                            <Box className={styles.targetWrapper}>
                                <TargetPane
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                            </Box>
                        </Box>
                        )}
                    </Box>
                </Box>
                <DragLayer />

                {/* Git 提交模态框 */}
                {isGitCommitModalOpen && projectData && (
                    <GitCommitModal
                        isOpen={isGitCommitModalOpen}
                        onCancel={handleCloseGitCommitModal}
                        onCommit={handleGitCommitSuccess}
                        onFetch={handleGitFetchSuccess}
                        onLogin={() => setIsOAuthModalOpen(true)}
                        projectData={projectData}
                        repository={vm.runtime.platform.git.repository}
                    />
                )}

                {/* Git 快捷操作模态框 */}
                {isGitQuickModalOpen && (
                    <GitQuickModal
                        isOpen={isGitQuickModalOpen}
                        type={gitQuickModalType}
                        repository={vm.runtime.platform.git.repository}
                        token={githubApi.getEffectiveToken() || ''}
                        vm={vm}
                        onCancel={handleCloseGitQuickModal}
                        onSuccess={handleGitQuickSuccess}
                    />
                )}

                {/* GitHub OAuth 认证模态框 */}
                {isOAuthModalOpen && (
                    <GitHubOAuthModal
                        isOpen={isOAuthModalOpen}
                        onCancel={handleCloseOAuthModal}
                        onSuccess={handleOAuthSuccess}
                        onError={handleOAuthError}
                    />
                )}
            </Box>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isWindowFullScreen: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    securityManager: PropTypes.shape({}),
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    tipsLibraryVisible: PropTypes.bool,
    usernameModalVisible: PropTypes.bool,
    settingsModalVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    unknownPlatformModalVisible: PropTypes.bool,
    invalidProjectModalVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    customUI: !!state.scratchGui.tw.customUI,
    // This is the button's mode, as opposed to the actual current state
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
