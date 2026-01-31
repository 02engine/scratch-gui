import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage, injectIntl, intlShape} from 'react-intl';
import Modal from '../../containers/modal.jsx';
import Button from '../button/button.jsx';
import Box from '../box/box.jsx';
import styles from './flarum-composer.css';
import {uploadFiles, createDiscussion, getTags} from '../../lib/flarum/api';
import {loadFlarumConfig, getDefaultForum} from '../../lib/flarum/config';

// 动态加载marked
let markedLoaded = false;
let markedPromise = null;

function loadMarked() {
    if (markedLoaded && window.marked) {
        return Promise.resolve(window.marked);
    }

    if (markedPromise) {
        return markedPromise;
    }

    markedPromise = new Promise((resolve, reject) => {
        if (window.marked) {
            markedLoaded = true;
            resolve(window.marked);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        script.onload = () => {
            markedLoaded = true;
            resolve(window.marked);
        };
        script.onerror = () => {
            reject(new Error('Failed to load marked'));
        };
        document.head.appendChild(script);
    });

    return markedPromise;
}

// BBCode解析器
function parseBBCode(text) {
    return text
        .replace(/\[b\](.*?)\[\/b\]/gis, '<strong>$1</strong>')
        .replace(/\[i\](.*?)\[\/i\]/gis, '<em>$1</em>')
        .replace(/\[u\](.*?)\[\/u\]/gis, '<u>$1</u>')
        .replace(
            /\[url=(.*?)\](.*?)\[\/url\]/gis,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>'
        );
}

class FlarumComposer extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            title: '',
            content: '',
            attaching: false,
            attachments: [],
            tags: [],
            selectedTags: [],
            loadingTags: false,
            markedLoaded: false
        };
    }

    async componentDidMount() {
        await this.loadTags();

        // 加载marked
        try {
            await loadMarked();
            this.setState({ markedLoaded: true });
        } catch (error) {
            console.warn('Failed to load marked:', error);
        }
    }

    async loadTags() {
        this.setState({ loadingTags: true });
        try {
            const config = await loadFlarumConfig();
            const forum = getDefaultForum(config);
            if (!forum) return;

            const tags = await getTags(forum.baseUrl, this.props.token);
            this.setState({ tags });
        } catch (error) {
            console.error('加载标签失败:', error);
            // 如果有token，尝试不带认证重新加载
            if (this.props.token) {
                try {
                    const config = await loadFlarumConfig();
                    const forum = getDefaultForum(config);
                    if (forum) {
                        const tags = await getTags(forum.baseUrl, null);
                        this.setState({ tags });
                    }
                } catch (fallbackError) {
                    console.error('备用加载标签也失败:', fallbackError);
                }
            }
        } finally {
            this.setState({ loadingTags: false });
        }
    }

    renderPreviewContent(text) {
        if (!text) {
            return (
                <div>
                    <FormattedMessage
                        defaultMessage="No content"
                        description="Empty preview"
                        id="gui.flarumComposer.emptyContent"
                    />
                </div>
            );
        }

        try {
            // 1️⃣ BBCode → HTML
            const bbcodeHTML = parseBBCode(text);

            // 2️⃣ Markdown → HTML
            const finalHTML = window.marked.parse(bbcodeHTML, {
                gfm: true,
                breaks: true
            });

            return <div dangerouslySetInnerHTML={{__html: finalHTML}} />;
        } catch (error) {
            console.warn('渲染失败:', error);
            return (
                <div>
                    <FormattedMessage
                        defaultMessage="Render error"
                        description="Preview render error"
                        id="gui.flarumComposer.renderError"
                    />
                </div>
            );
        }
    }



    toggleTag(tagId) {
        this.setState(prevState => {
            const selectedTags = prevState.selectedTags.includes(tagId)
                ? prevState.selectedTags.filter(id => id !== tagId)
                : [...prevState.selectedTags, tagId];
            return { selectedTags };
        });
    }

    async attachProject () {
        if (!this.props.vm) return alert('无法获取 vm');
        this.setState({attaching: true});
        try {
            // vm.saveProjectSb3 返回 arraybuffer（工程的 sb3）
            const arr = await this.props.vm.saveProjectSb3('arraybuffer');
            const blob = new Blob([arr], {type: 'application/zip'});
            const file = new File([blob], `${this.props.projectName || 'project'}.sb3`, {type: 'application/zip'});
            this.setState({attachments: [file]});
            alert('已准备项目作为附件');
        } catch (e) {
            alert('导出项目失败：' + e.message);
        } finally {
            this.setState({attaching: false});
        }
    }

    async send () {
        if (!this.props.token) {
            alert(this.props.intl.formatMessage({
                defaultMessage: 'Please login to Flarum first',
                description: 'Not logged in to Flarum',
                id: 'gui.flarumComposer.notLoggedIn'
            }));
            return;
        }

        const cfg = await loadFlarumConfig();
        const forum = getDefaultForum(cfg);
        if (!forum) return alert('请先在 flarum.config.json 配置论坛');

        // 使用选中的标签，如果没有选中则使用默认标签
        const tagIds = this.state.selectedTags.length > 0 ? this.state.selectedTags : [forum.defaultTagId];

        try {
            let content = this.state.content;
            if (this.state.attachments.length > 0) {
                // 上传附件并将返回的 bbcode 附加到正文（兼容 fof-upload）
                const up = await uploadFiles(forum.baseUrl, this.props.token, this.state.attachments);
                const items = up.data ? (Array.isArray(up.data) ? up.data : [up.data]) : [];
                const bbcodes = items.map(i => i?.attributes?.bbcode).filter(Boolean);
                if (bbcodes.length > 0) content += '\n\n' + bbcodes.join('\n');
            }
            const res = await createDiscussion(forum.baseUrl, this.props.token, this.state.title || '(无标题)', content, tagIds);
            alert(this.props.intl.formatMessage({
                defaultMessage: 'Posted successfully: {title}',
                description: 'Post success message',
                id: 'gui.flarumComposer.postSuccess'
            }, {
                title: res.data?.attributes?.title || '帖子已创建'
            }));
            if (this.props.onDone) this.props.onDone(res);
        } catch (e) {
            alert(this.props.intl.formatMessage({
                defaultMessage: 'Failed to post: {error}',
                description: 'Post failure message',
                id: 'gui.flarumComposer.postFailed'
            }, {
                error: e.message
            }));
        }
    }

    render () {
        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onRequestClose}
                contentLabel="Flarum 发帖"
                id="flarumComposer"
            >
                <Box className={styles.body}>
                    <div className={styles.setting}>
                        <div className={styles.label}>
                            <strong>
                                <FormattedMessage
                                    defaultMessage="Title"
                                    description="Title label"
                                    id="gui.flarumComposer.titleLabel"
                                />
                            </strong>
                        </div>
                        <input 
                            className={styles.composerField} 
                            placeholder={this.props.intl.formatMessage({
                                defaultMessage: 'Enter post title',
                                description: 'Title input placeholder',
                                id: 'gui.flarumComposer.titlePlaceholder'
                            })}
                            value={this.state.title} 
                            onChange={(e) => this.setState({title: e.target.value})} 
                        />
                    </div>

                    <div className={styles.setting}>
                        <div className={styles.label}>
                            <strong>
                                <FormattedMessage
                                    defaultMessage="Content Editor"
                                    description="Content editor label"
                                    id="gui.flarumComposer.contentLabel"
                                />
                            </strong>
                        </div>
                        <textarea
                            className={styles.composerField}
                            rows={8}
                            placeholder={this.props.intl.formatMessage({
                                defaultMessage: 'Support Markdown and BBCode mixed use',
                                description: 'Content editor placeholder',
                                id: 'gui.flarumComposer.contentPlaceholder'
                            })}
                            value={this.state.content}
                            onChange={(e) => this.setState({content: e.target.value})}
                            style={{width: '100%', boxSizing: 'border-box', minHeight: '150px'}}
                        />
                    </div>

                    <div className={styles.setting}>
                        <div className={styles.label}>
                            <strong>
                                <FormattedMessage
                                    defaultMessage="Live Preview"
                                    description="Live preview label"
                                    id="gui.flarumComposer.previewLabel"
                                />
                            </strong>
                        </div>
                        <div className={styles.composerPreview}>
                            {this.renderPreviewContent(this.state.content)}
                        </div>
                    </div>

                    {/* 标签选择区域 */}
                    <div className={styles.setting}>
                        <div className={styles.label}>
                            <strong>
                                <FormattedMessage
                                    defaultMessage="Select Tags"
                                    description="Select tags label"
                                    id="gui.flarumComposer.tagsLabel"
                                />
                            </strong>
                        </div>
                        {this.state.loadingTags ? (
                            <div>
                                <FormattedMessage
                                    defaultMessage="Loading tags..."
                                    description="Loading tags"
                                    id="gui.flarumComposer.loadingTags"
                                />
                            </div>
                        ) : this.state.tags.length > 0 ? (
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                                {this.state.tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => this.toggleTag(tag.id)}
                                        style={{
                                            padding: '4px 8px',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px',
                                            background: this.state.selectedTags.includes(tag.id) ? '#007cba' : '#fff',
                                            color: this.state.selectedTags.includes(tag.id) ? '#fff' : '#333',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        {tag.attributes?.name || tag.attributes?.slug || `Tag ${tag.id}`}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div style={{color: '#666', fontSize: '12px'}}>
                                <FormattedMessage
                                    defaultMessage="No available tags, will use default"
                                    description="No available tags"
                                    id="gui.flarumComposer.noTagsAvailable"
                                />
                            </div>
                        )}
                        {this.state.selectedTags.length > 0 && (
                            <div style={{marginTop: '8px', fontSize: '12px', color: '#666'}}>
                                <FormattedMessage
                                    defaultMessage="{count} tags selected"
                                    description="Tags selected count"
                                    id="gui.flarumComposer.tagsSelected"
                                    values={{count: this.state.selectedTags.length}}
                                />
                            </div>
                        )}
                    </div>

                    <div className={styles.setting}>
                        <div style={{display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Button onClick={() => this.attachProject()} disabled={this.state.attaching}>
                                <FormattedMessage
                                    defaultMessage="Attach Project"
                                    description="Attach current project"
                                    id="gui.flarumComposer.attachProject"
                                />
                            </Button>
                            <div style={{display: 'flex', gap: '12px'}}>
                                <Button onClick={() => this.props.onRequestClose()}>
                                    <FormattedMessage
                                        defaultMessage="Cancel"
                                        description="Cancel button"
                                        id="gui.flarumComposer.cancel"
                                    />
                                </Button>
                                <Button onClick={() => this.send()}>
                                    <FormattedMessage
                                        defaultMessage="Send to Forum"
                                        description="Send to forum button"
                                        id="gui.flarumComposer.send"
                                    />
                                </Button>
                            </div>
                        </div>
                    </div>
                </Box>
            </Modal>
        );
    }
}

FlarumComposer.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func,
    onDone: PropTypes.func,
    vm: PropTypes.object,
    projectName: PropTypes.string,
    token: PropTypes.string
};

export default injectIntl(FlarumComposer);
