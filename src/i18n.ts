export const languages = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
} as const;

export const defaultLang: keyof typeof languages = 'en';

export type Lang = keyof typeof languages;

export const supportedLocales: Lang[] = ['en', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'];

const navigationLabels: Partial<Record<Lang, Record<string, string>>> = {
  ja: {
    Products: '製品',
    Solutions: 'ソリューション',
    Resources: 'リソース',
    Company: '会社情報',
    Enterprise: 'エンタープライズ',
    Developers: '開発者',
    Support: 'サポート',
    Startups: 'スタートアップ',
    Blog: 'ブログ',
    About: '会社概要',
    Contact: 'お問い合わせ',
    Login: 'ログイン',
    Signup: '登録',
    'CinaSeek — Intelligent Search': 'CinaSeek — インテリジェント検索',
    'CinaClaw — AI Assistant': 'CinaClaw — AI アシスタント',
    'CinaToken — AI API Gateway': 'CinaToken — AI API ゲートウェイ',
    'CinaSkill — Skills Platform': 'CinaSkill — スキルプラットフォーム',
    'CinaChain — Blockchain Network': 'CinaChain — 接続インフラ',
    'Developer Blog': '開発者ブログ',
    'Contact Support': 'サポートへ連絡',
    'About Us': '会社概要',
    'Terms of Service': '利用規約',
    'Privacy Policy': 'プライバシーポリシー',
  },
  ko: {
    Products: '제품',
    Solutions: '솔루션',
    Resources: '리소스',
    Company: '회사',
    Enterprise: '엔터프라이즈',
    Developers: '개발자',
    Support: '지원',
    Startups: '스타트업',
    Blog: '블로그',
    About: '회사 소개',
    Contact: '문의',
    Login: '로그인',
    Signup: '가입',
    'CinaSeek — Intelligent Search': 'CinaSeek — 지능형 검색',
    'CinaClaw — AI Assistant': 'CinaClaw — AI 어시스턴트',
    'CinaToken — AI API Gateway': 'CinaToken — AI API 게이트웨이',
    'CinaSkill — Skills Platform': 'CinaSkill — 스킬 플랫폼',
    'CinaChain — Blockchain Network': 'CinaChain — 연결 인프라',
    'Developer Blog': '개발자 블로그',
    'Contact Support': '지원 문의',
    'About Us': '회사 소개',
    'Terms of Service': '서비스 약관',
    'Privacy Policy': '개인정보 보호정책',
  },
  ru: {
    Products: 'Продукты',
    Solutions: 'Решения',
    Resources: 'Ресурсы',
    Company: 'Компания',
    Enterprise: 'Для компаний',
    Developers: 'Разработчикам',
    Support: 'Поддержка',
    Startups: 'Стартапам',
    Blog: 'Блог',
    About: 'О компании',
    Contact: 'Контакты',
    Login: 'Войти',
    Signup: 'Регистрация',
    'CinaSeek — Intelligent Search': 'CinaSeek — корпоративный поиск',
    'CinaClaw — AI Assistant': 'CinaClaw — помощник процессов',
    'CinaToken — AI API Gateway': 'CinaToken — модельный шлюз',
    'CinaSkill — Skills Platform': 'CinaSkill — повторно используемые возможности',
    'CinaChain — Blockchain Network': 'CinaChain — связанная инфраструктура',
    'Developer Blog': 'Блог разработчиков',
    'Contact Support': 'Связаться с поддержкой',
    'About Us': 'О компании',
    'Terms of Service': 'Условия использования',
    'Privacy Policy': 'Политика конфиденциальности',
  },
  es: {
    Products: 'Productos',
    Solutions: 'Soluciones',
    Resources: 'Recursos',
    Company: 'Empresa',
    Enterprise: 'Empresas',
    Developers: 'Desarrolladores',
    Support: 'Soporte',
    Startups: 'Startups',
    Blog: 'Blog',
    About: 'Quiénes somos',
    Contact: 'Contacto',
    Login: 'Entrar',
    Signup: 'Registro',
    'CinaSeek — Intelligent Search': 'CinaSeek — búsqueda empresarial',
    'CinaClaw — AI Assistant': 'CinaClaw — asistente de flujo',
    'CinaToken — AI API Gateway': 'CinaToken — gateway de modelos',
    'CinaSkill — Skills Platform': 'CinaSkill — capacidades reutilizables',
    'CinaChain — Blockchain Network': 'CinaChain — infraestructura conectada',
    'Developer Blog': 'Blog para desarrolladores',
    'Contact Support': 'Contactar con soporte',
    'About Us': 'Quiénes somos',
    'Terms of Service': 'Términos de servicio',
    'Privacy Policy': 'Política de privacidad',
  },
  pt: {
    Products: 'Produtos',
    Solutions: 'Soluções',
    Resources: 'Recursos',
    Company: 'Empresa',
    Enterprise: 'Empresas',
    Developers: 'Desenvolvedores',
    Support: 'Suporte',
    Startups: 'Startups',
    Blog: 'Blog',
    About: 'Sobre',
    Contact: 'Contato',
    Login: 'Entrar',
    Signup: 'Cadastro',
    'CinaSeek — Intelligent Search': 'CinaSeek — busca empresarial',
    'CinaClaw — AI Assistant': 'CinaClaw — assistente de fluxo',
    'CinaToken — AI API Gateway': 'CinaToken — gateway de modelos',
    'CinaSkill — Skills Platform': 'CinaSkill — capacidades reutilizáveis',
    'CinaChain — Blockchain Network': 'CinaChain — infraestrutura conectada',
    'Developer Blog': 'Blog para desenvolvedores',
    'Contact Support': 'Falar com o suporte',
    'About Us': 'Sobre',
    'Terms of Service': 'Termos de serviço',
    'Privacy Policy': 'Política de privacidade',
  },
  fr: {
    Products: 'Produits',
    Solutions: 'Solutions',
    Resources: 'Ressources',
    Company: 'Entreprise',
    Enterprise: 'Entreprises',
    Developers: 'Développeurs',
    Support: 'Support',
    Startups: 'Startups',
    Blog: 'Blog',
    About: 'À propos',
    Contact: 'Contact',
    Login: 'Connexion',
    Signup: 'Inscription',
    'CinaSeek — Intelligent Search': 'CinaSeek — recherche d’entreprise',
    'CinaClaw — AI Assistant': 'CinaClaw — assistant de flux',
    'CinaToken — AI API Gateway': 'CinaToken — passerelle de modèles',
    'CinaSkill — Skills Platform': 'CinaSkill — capacités réutilisables',
    'CinaChain — Blockchain Network': 'CinaChain — infrastructure connectée',
    'Developer Blog': 'Blog développeurs',
    'Contact Support': 'Contacter le support',
    'About Us': 'À propos',
    'Terms of Service': 'Conditions d’utilisation',
    'Privacy Policy': 'Politique de confidentialité',
  },
};

export function getLocalizedLabel(lang: Lang, label?: string) {
  if (!label) return label;
  return navigationLabels[lang]?.[label] ?? label;
}

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) return lang as Lang;
  return defaultLang;
}

export function changeLangPath(url: URL, newLang: Lang) {
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] in languages) {
    parts.shift();
  }

  const path = parts.length ? `/${parts.join('/')}` : '';
  const localizedPath = newLang === defaultLang ? path || '/' : `/${newLang}${path}`;

  return `${localizedPath}${url.search}${url.hash}`;
}

export function getPath(path: string, lang: string = defaultLang) {
  if (lang === defaultLang) {
    return path;
  }
  return `/${lang}${path}`;
}
