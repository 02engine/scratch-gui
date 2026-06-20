import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';

import DebugWindowComponent from '../components/debug-window/debug-window.jsx';

const DEFAULT_VALUE = `[
    {
        "id": 3,
        "type": "script",
        "mime": "application/json",
        "name": "code",
        "bodyData": [91, 123, 34, 105, 100, 34]
    }
]`;

class DebugWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleCancel',
            'handleChange',
            'handleOk',
            'handleKeyDown',
            'handleKeyUp'
        ]);
        this.state = {
            value: DEFAULT_VALUE,
            error: null,
            success: null
        };
        this._zPressed = false;
    }

    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    handleKeyDown (event) {
        // 检测 Ctrl/Cmd + Shift + Z 三键同时按下
        if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === 'z' &&
            !event.repeat
        ) {
            // 当 Ctrl/Cmd + Shift + Z 按下时，标记 Z 键已按下
            this._zPressed = true;
            this._zEvent = event;
        }

        // 如果在 Z 按下后紧接着检测到 9 键（四键同时按下）
        // 使用 event.code 以兼容不同键盘布局（Shift+9 在不同布局下 event.key 不同）
        if (
            this._zPressed &&
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.code === 'Digit9' &&
            !event.repeat
        ) {
            event.preventDefault();
            event.stopPropagation();
            this._zPressed = false;
            this.props.onToggleDebugWindow();
        }
    }

    handleKeyUp (event) {
        if (event.key.toLowerCase() === 'z' || event.code === 'KeyZ') {
            this._zPressed = false;
        }
        if (event.code === 'Digit9') {
            this._zPressed = false;
        }
    }

    handleCancel () {
        this.props.onToggleDebugWindow();
    }

    handleChange (event) {
        this.setState({
            value: event.target.value,
            error: null,
            success: null
        });
    }

    handleOk () {
        this.setState({error: null, success: null});

        try {
            // 解析用户输入的 JSON
            let myData;
            try {
                myData = JSON.parse(this.state.value);
            } catch (e) {
                this.setState({error: `JSON 解析错误: ${e.message}`});
                return;
            }

            const dbName = 'TW_Backpack';
            const storeName = 'backpack';

            // 如果是数组，自动取出第一个对象
            if (Array.isArray(myData)) {
                myData = myData[0];
            }

            // 健壮性检查
            if (!myData) {
                this.setState({error: '错误：传入的数据数组为空或无效！'});
                return;
            }

            const request = indexedDB.open(dbName);

            request.onsuccess = (event) => {
                const db = event.target.result;

                const transaction = db.transaction([storeName], 'readwrite');
                const objectStore = transaction.objectStore(storeName);

                const putRequest = objectStore.put(myData);

                putRequest.onsuccess = () => {
                    this.setState({success: '成功：数据已存入，且符合 keyPath 要求！'});
                    // 触发书包刷新事件
                    window.dispatchEvent(new CustomEvent('backpack-refresh'));
                };
                putRequest.onerror = (e) => {
                    this.setState({error: `写入失败: ${e.target.error}`});
                };

                transaction.oncomplete = () => {
                    db.close();
                };
            };

            request.onerror = (e) => {
                this.setState({error: `打开数据库失败: ${e.target.error}`});
            };

            request.onupgradeneeded = (event) => {
                // 如果数据库或对象存储不存在，先创建
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, {keyPath: 'id'});
                }
            };
        } catch (e) {
            this.setState({error: `操作失败: ${e.message}`});
        }
    }

    render () {
        if (!this.props.visible) {
            return null;
        }

        return (
            <DebugWindowComponent
                value={this.state.value}
                error={this.state.error}
                success={this.state.success}
                onCancel={this.handleCancel}
                onChange={this.handleChange}
                onOk={this.handleOk}
            />
        );
    }
}

DebugWindow.propTypes = {
    visible: PropTypes.bool.isRequired,
    onToggleDebugWindow: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    // visible is set by parent component via prop
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(DebugWindow);