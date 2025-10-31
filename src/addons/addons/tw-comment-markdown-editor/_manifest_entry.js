/**
 * @license
 * ScratchComment Markdown Editor addon
 */

const manifest = {
    editorOnly: true,
    noTranslations: true,
    name: 'Markdown注释编辑器',
    description: '为注释框添加Markdown编辑和预览功能，支持标题、粗体、斜体、代码和链接等语法。使用快捷键 Ctrl+M 快速切换编辑/预览模式',
    tags: ['editor', 'comments', 'markdown'],
    credits: [
        {
            name: 'NeuronPulse',
            link: 'https://github.com/NeuronPulse'
        }
    ],
    userstyles: [
        {
            url: 'userstyle.css'
        }
    ],
    userscripts: [
        {
            url: 'userscript.js'
        }
    ],
    dynamicDisable: true,
    enabledByDefault: false
};

export default manifest;
