/**
 * 自定义多语言翻译系统
 * 用于Git功能、论坛功能、悬浮舞台等自定义组件的翻译
 */

class TWCustomTranslations {
    constructor() {
        this.currentLanguage = 'zh-CN';
        this.translations = {
            'zh-CN': {
                git: {
                    commit: '提交',
                    push: '推送',
                    pull: '拉取',
                    fetch: '获取',
                    oauthTitle: 'GitHub OAuth 认证',
                    oauthDescription: '点击下方按钮使用GitHub OAuth安全获取构建权限，无需手动输入Token。',
                    authenticateButton: '使用 GitHub 登录',
                    logoutButton: '退出登录',
                    cancelButton: '取消',
                    loading: '加载中...',
                    authenticatedUser: '已认证用户',
                    domainInfo: '当前域名: {domain}',
                    setupInstructions: '要设置 OAuth 认证：',
                    setupStep1: '1. 前往 GitHub 设置 > 开发者设置 > OAuth Apps',
                    setupStep2: '2. 创建新的 OAuth App 或使用现有的',
                    setupStep3: '3. 将授权回调 URL 设置为: {callbackUrl}',
                    setupStep4: '4. 复制 Client ID 并粘贴到下方',
                    useGitHubLogin: '使用 GitHub 登录',
                    domainConfigWarning: '未找到域名 {domain} 的配置，使用默认配置'
                },
                forum: {
                    post: '发帖',
                    reply: '回复',
                    edit: '编辑',
                    delete: '删除',
                    like: '点赞',
                    title: '标题',
                    content: '内容',
                    publish: '发布',
                    preview: '预览',
                    saveDraft: '保存草稿'
                },
                stage: {
                    hoverMessage: '悬浮舞台提示',
                    greenFlag: '绿色旗帜',
                    stopAll: '停止所有',
                    turboMode: 'Turbo 模式',
                    normalMode: '正常模式',
                    fullscreen: '全屏',
                    exitFullscreen: '退出全屏',
                    smallStage: '小舞台',
                    largeStage: '大舞台'
                },
                common: {
                    yes: '是',
                    no: '否',
                    ok: '确定',
                    cancel: '取消',
                    save: '保存',
                    delete: '删除',
                    edit: '编辑',
                    loading: '加载中...',
                    error: '错误',
                    success: '成功',
                    warning: '警告',
                    info: '信息',
                    retry: '重试'
                }
            },
            'en-US': {
                git: {
                    commit: 'Commit',
                    push: 'Push',
                    pull: 'Pull',
                    fetch: 'Fetch',
                    oauthTitle: 'GitHub OAuth Authentication',
                    oauthDescription: 'Click the button below to use GitHub OAuth to securely obtain build permissions without manually entering tokens.',
                    authenticateButton: 'Sign in with GitHub',
                    logoutButton: 'Logout',
                    cancelButton: 'Cancel',
                    loading: 'Loading...',
                    authenticatedUser: 'Authenticated User',
                    domainInfo: 'Current domain: {domain}',
                    setupInstructions: 'To set up OAuth authentication:',
                    setupStep1: '1. Go to GitHub Settings > Developer settings > OAuth Apps',
                    setupStep2: '2. Create a new OAuth App or use an existing one',
                    setupStep3: '3. Set Authorization callback URL to: {callbackUrl}',
                    setupStep4: '4. Copy the Client ID and paste it below',
                    useGitHubLogin: 'Sign in with GitHub',
                    domainConfigWarning: 'No configuration found for domain {domain}, using default configuration'
                },
                forum: {
                    post: 'Post',
                    reply: 'Reply',
                    edit: 'Edit',
                    delete: 'Delete',
                    like: 'Like',
                    title: 'Title',
                    content: 'Content',
                    publish: 'Publish',
                    preview: 'Preview',
                    saveDraft: 'Save Draft'
                },
                stage: {
                    hoverMessage: 'Stage Hover Message',
                    greenFlag: 'Green Flag',
                    stopAll: 'Stop All',
                    turboMode: 'Turbo Mode',
                    normalMode: 'Normal Mode',
                    fullscreen: 'Fullscreen',
                    exitFullscreen: 'Exit Fullscreen',
                    smallStage: 'Small Stage',
                    largeStage: 'Large Stage'
                },
                common: {
                    yes: 'Yes',
                    no: 'No',
                    ok: 'OK',
                    cancel: 'Cancel',
                    save: 'Save',
                    delete: 'Delete',
                    edit: 'Edit',
                    loading: 'Loading...',
                    error: 'Error',
                    success: 'Success',
                    warning: 'Warning',
                    info: 'Info',
                    retry: 'Retry'
                }
            },
            'ja-JP': {
                git: {
                    commit: 'コミット',
                    push: 'プッシュ',
                    pull: 'プル',
                    fetch: 'フェッチ',
                    oauthTitle: 'GitHub OAuth 認証',
                    oauthDescription: '下のボタンをクリックして、GitHub OAuthを使用してトークンを手動で入力せずにビルド権限を安全に取得します。',
                    authenticateButton: 'GitHubでログイン',
                    logoutButton: 'ログアウト',
                    cancelButton: 'キャンセル',
                    loading: '読み込み中...',
                    authenticatedUser: '認証済みユーザー',
                    domainInfo: '現在のドメイン: {domain}',
                    setupInstructions: 'OAuth認証を設定するには：',
                    setupStep1: '1. GitHub設定 > 開発者設定 > OAuth Appsに移動',
                    setupStep2: '2. 新しいOAuth Appを作成するか、既存のを使用',
                    setupStep3: '3. 認証コールバックURLを次に設定: {callbackUrl}',
                    setupStep4: '4. Client IDをコピーして下に貼り付け',
                    useGitHubLogin: 'GitHubでログイン',
                    domainConfigWarning: 'ドメイン {domain} の設定が見つかりません。デフォルト設定を使用します'
                },
                forum: {
                    post: '投稿',
                    reply: '返信',
                    edit: '編集',
                    delete: '削除',
                    like: 'いいね',
                    title: 'タイトル',
                    content: '内容',
                    publish: '公開',
                    preview: 'プレビュー',
                    saveDraft: '下書き保存'
                },
                stage: {
                    hoverMessage: 'ステージホバーメッセージ',
                    greenFlag: '緑の旗',
                    stopAll: 'すべて停止',
                    turboMode: 'ターボモード',
                    normalMode: '通常モード',
                    fullscreen: 'フルスクリーン',
                    exitFullscreen: 'フルスクリーン終了',
                    smallStage: '小さなステージ',
                    largeStage: '大きなステージ'
                },
                common: {
                    yes: 'はい',
                    no: 'いいえ',
                    ok: 'OK',
                    cancel: 'キャンセル',
                    save: '保存',
                    delete: '削除',
                    edit: '編集',
                    loading: '読み込み中...',
                    error: 'エラー',
                    success: '成功',
                    warning: '警告',
                    info: '情報',
                    retry: '再試行'
                }
            },
            'ko-KR': {
                git: {
                    commit: '커밋',
                    push: '푸시',
                    pull: '풀',
                    fetch: '가져오기',
                    oauthTitle: 'GitHub OAuth 인증',
                    oauthDescription: '아래 버튼을 클릭하여 GitHub OAuth를 사용하여 토큰을 수동으로 입력하지 않고 빌드 권한을 안전하게 얻으세요.',
                    authenticateButton: 'GitHub으로 로그인',
                    logoutButton: '로그아웃',
                    cancelButton: '취소',
                    loading: '로딩 중...',
                    authenticatedUser: '인증된 사용자',
                    domainInfo: '현재 도메인: {domain}',
                    setupInstructions: 'OAuth 인증을 설정하려면:',
                    setupStep1: '1. GitHub 설정 > 개발자 설정 > OAuth Apps로 이동',
                    setupStep2: '2. 새로운 OAuth App을 만들거나 기존 것을 사용',
                    setupStep3: '3. 인증 콜백 URL을 다음으로 설정: {callbackUrl}',
                    setupStep4: '4. Client ID를 복사하여 아래에 붙여넣기',
                    useGitHubLogin: 'GitHub으로 로그인',
                    domainConfigWarning: '도메인 {domain}의 구성을 찾을 수 없습니다. 기본 구성을 사용합니다'
                },
                forum: {
                    post: '게시물',
                    reply: '답글',
                    edit: '편집',
                    delete: '삭제',
                    like: '좋아요',
                    title: '제목',
                    content: '내용',
                    publish: '게시',
                    preview: '미리보기',
                    saveDraft: '임시저장'
                },
                stage: {
                    hoverMessage: '무대 호버 메시지',
                    greenFlag: '녹색 깃발',
                    stopAll: '모두 중지',
                    turboMode: '터보 모드',
                    normalMode: '일반 모드',
                    fullscreen: '전체화면',
                    exitFullscreen: '전체화면 종료',
                    smallStage: '작은 무대',
                    largeStage: '큰 무대'
                },
                common: {
                    yes: '예',
                    no: '아니오',
                    ok: '확인',
                    cancel: '취소',
                    save: '저장',
                    delete: '삭제',
                    edit: '편집',
                    loading: '로딩 중...',
                    error: '오류',
                    success: '성공',
                    warning: '경고',
                    info: '정보',
                    retry: '다시 시도'
                }
            },
            'zh-TW': {
                git: {
                    commit: '提交',
                    push: '推送',
                    pull: '拉取',
                    fetch: '獲取',
                    oauthTitle: 'GitHub OAuth 認證',
                    oauthDescription: '點擊下方按鈕使用GitHub OAuth安全獲取構建權限，無需手動輸入Token。',
                    authenticateButton: '使用 GitHub 登入',
                    logoutButton: '登出',
                    cancelButton: '取消',
                    loading: '載入中...',
                    authenticatedUser: '已認證用戶',
                    domainInfo: '當前域名: {domain}',
                    setupInstructions: '要設置 OAuth 認證：',
                    setupStep1: '1. 前往 GitHub 設置 > 開發者設置 > OAuth Apps',
                    setupStep2: '2. 創建新的 OAuth App 或使用現有的',
                    setupStep3: '3. 將授權回調 URL 設置為: {callbackUrl}',
                    setupStep4: '4. 複製 Client ID 並粘貼到下方',
                    useGitHubLogin: '使用 GitHub 登入',
                    domainConfigWarning: '未找到域名 {domain} 的配置，使用預設配置'
                },
                forum: {
                    post: '發帖',
                    reply: '回復',
                    edit: '編輯',
                    delete: '刪除',
                    like: '點讚',
                    title: '標題',
                    content: '內容',
                    publish: '發布',
                    preview: '預覽',
                    saveDraft: '儲存草稿'
                },
                stage: {
                    hoverMessage: '懸浮舞台提示',
                    greenFlag: '綠色旗幟',
                    stopAll: '停止所有',
                    turboMode: 'Turbo 模式',
                    normalMode: '正常模式',
                    fullscreen: '全屏',
                    exitFullscreen: '退出全屏',
                    smallStage: '小舞台',
                    largeStage: '大舞台'
                },
                common: {
                    yes: '是',
                    no: '否',
                    ok: '確定',
                    cancel: '取消',
                    save: '儲存',
                    delete: '刪除',
                    edit: '編輯',
                    loading: '載入中...',
                    error: '錯誤',
                    success: '成功',
                    warning: '警告',
                    info: '資訊',
                    retry: '重試'
                }
            },
            'es-ES': {
                git: {
                    commit: 'Confirmar',
                    push: 'Empujar',
                    pull: 'Tirar',
                    fetch: 'Obtener',
                    oauthTitle: 'Autenticación GitHub OAuth',
                    oauthDescription: 'Haz clic en el botón de abajo para usar GitHub OAuth y obtener de forma segura permisos de construcción sin introducir tokens manualmente.',
                    authenticateButton: 'Iniciar sesión con GitHub',
                    logoutButton: 'Cerrar sesión',
                    cancelButton: 'Cancelar',
                    loading: 'Cargando...',
                    authenticatedUser: 'Usuario autenticado',
                    domainInfo: 'Dominio actual: {domain}',
                    setupInstructions: 'Para configurar la autenticación OAuth:',
                    setupStep1: '1. Ve a Configuración de GitHub > Configuración de desarrollador > OAuth Apps',
                    setupStep2: '2. Crea una nueva OAuth App o usa una existente',
                    setupStep3: '3. Establece la URL de callback de autorización en: {callbackUrl}',
                    setupStep4: '4. Copia el Client ID y pégalo abajo',
                    useGitHubLogin: 'Iniciar sesión con GitHub',
                    domainConfigWarning: 'No se encontró configuración para el dominio {domain}, usando configuración predeterminada'
                },
                forum: {
                    post: 'Publicar',
                    reply: 'Responder',
                    edit: 'Editar',
                    delete: 'Eliminar',
                    like: 'Me gusta',
                    title: 'Título',
                    content: 'Contenido',
                    publish: 'Publicar',
                    preview: 'Vista previa',
                    saveDraft: 'Guardar borrador'
                },
                stage: {
                    hoverMessage: 'Mensaje de escenario hover',
                    greenFlag: 'Bandera verde',
                    stopAll: 'Detener todo',
                    turboMode: 'Modo turbo',
                    normalMode: 'Modo normal',
                    fullscreen: 'Pantalla completa',
                    exitFullscreen: 'Salir de pantalla completa',
                    smallStage: 'Escenario pequeño',
                    largeStage: 'Escenario grande'
                },
                common: {
                    yes: 'Sí',
                    no: 'No',
                    ok: 'OK',
                    cancel: 'Cancelar',
                    save: 'Guardar',
                    delete: 'Eliminar',
                    edit: 'Editar',
                    loading: 'Cargando...',
                    error: 'Error',
                    success: 'Éxito',
                    warning: 'Advertencia',
                    info: 'Información',
                    retry: 'Reintentar'
                }
            }
        };
    }

    setLanguage(language) {
        if (this.translations[language]) {
            this.currentLanguage = language;
        }
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    t(key, params = {}) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        for (const k of keys) {
            if (translation && translation[k]) {
                translation = translation[k];
            } else {
                return key;
            }
        }
        
        if (typeof translation === 'string') {
            return this.replaceParams(translation, params);
        }
        
        return key;
    }

    replaceParams(text, params) {
        return text.replace(/\{(\w+)\}/g, (match, paramKey) => {
            return params[paramKey] !== undefined ? params[paramKey] : match;
        });
    }

    getAvailableLanguages() {
        return Object.keys(this.translations);
    }

    getLanguageName(language) {
        const names = {
            'zh-CN': '简体中文',
            'en-US': 'English',
            'ja-JP': '日本語',
            'ko-KR': '한국어',
            'zh-TW': '繁體中文',
            'es-ES': 'Español'
        };
        return names[language] || language;
    }
}

export default new TWCustomTranslations();
