/* 造像工具栏改为多列换行显示，避免窄窗口下工具被裁掉 */
export default {
    editorOnly: true,
    noTranslations: true,
    name: '造像工具栏布局',
    description: '窄窗口下 scratch-paint 会把造像工具栏改成单列，导致后面的工具被裁掉看不见。' +
        '本插件强制工具栏多列换行排列，并在工具过多时允许纵向滚动，同时自动把当前选中的工具滚动到可见位置。',
    credits: [
        {
            name: '13244431027'
        }
    ],
    userscripts: [
        {
            url: 'userscript.js'
        }
    ],
    userstyles: [
        {
            url: 'style.css'
        }
    ],
    tags: [
        'editor',
        'paintEditor'
    ],
    dynamicDisable: true,
    enabledByDefault: true
};
