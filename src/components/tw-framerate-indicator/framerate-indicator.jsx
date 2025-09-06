import React, {useEffect} from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import {connect} from 'react-redux';
import styles from './framerate-indicator.css';
import VM from 'scratch-vm';
import {setOpsPerFrameState} from '../../reducers/tw';

const FramerateIndicator = ({
    framerate,
    interpolation,
    opsPerFrame,
    vm,
    setOpsPerFrame
}) => {
    // 定义同步函数：获取vm中的值并更新Redux
    const syncOpsPerFrame = () => {
        // 容错处理：确保vm和方法存在
        if (!vm || typeof vm.getOpsPerFrame !== 'function') return;
        
        const currentVmOps = vm.getOpsPerFrame();
        // 只有当值不一致时才更新，减少不必要的状态更新
        if (opsPerFrame !== currentVmOps) {
            setOpsPerFrame(currentVmOps);
        }
    };

    // 组件挂载时启动定时器，卸载时清除
    useEffect(() => {
        // 每100ms同步一次（可根据需求调整间隔）
        const intervalId = setInterval(syncOpsPerFrame, 100);

        // 组件卸载时清除定时器，防止内存泄漏
        return () => clearInterval(intervalId);
    }, [vm, opsPerFrame, setOpsPerFrame]); // 依赖变化时重新创建定时器

    // 实时获取当前值用于渲染（使用最新值显示）
    const currentVmOps = vm?.getOpsPerFrame?.() ?? 1;

    return (
        <React.Fragment>
            {framerate !== 30 && framerate !== 0 && (
                <div className={styles.framerateContainer}>
                    <div className={styles.framerateLabel}>
                        <FormattedMessage
                            defaultMessage="{framerate} FPS"
                            id="tw.fps"
                            values={{framerate}}
                        />
                    </div>
                </div>
            )}
            {currentVmOps !== 1 && (
                <div className={styles.framerateContainer}>
                    <div className={styles.framerateLabel}>
                        <FormattedMessage
                            defaultMessage="{opsPerFrame} OPF"
                            id="tw.opf"
                            values={{opsPerFrame: currentVmOps}}
                        />
                    </div>
                </div>
            )}
            {interpolation && (
                <div className={styles.framerateContainer}>
                    <div className={styles.framerateLabel}>
                        <FormattedMessage
                            defaultMessage="Interpolation"
                            id="tw.interpolationEnabled"
                        />
                    </div>
                </div>
            )}
        </React.Fragment>
    );
};

FramerateIndicator.propTypes = {
    framerate: PropTypes.number,
    interpolation: PropTypes.bool,
    opsPerFrame: PropTypes.number,
    vm: PropTypes.instanceOf(VM),
    setOpsPerFrame: PropTypes.func.isRequired
};

const mapDispatchToProps = dispatch => ({
    setOpsPerFrame: value => dispatch(setOpsPerFrameState(value))
});

const mapStateToProps = state => ({
    opsPerFrame: state.scratchGui.tw.opsPerFrame,
    framerate: state.scratchGui.tw.framerate,
    interpolation: state.scratchGui.tw.interpolation,
    vm: state.scratchGui.vm
});

export default connect(mapStateToProps, mapDispatchToProps)(FramerateIndicator);
