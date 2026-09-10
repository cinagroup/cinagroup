import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copy, type Copy, type Locale } from '../data/home-copy';

type Language = Locale | 'en';
const locales: [Language, string][] = [
  ['en', 'English'],
  ['zh', '简体中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['ru', 'Русский'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['fr', 'Français'],
];
// Copy stays separate from the interaction model so every locale shares the same accessible UI.
const labels: Record<Language, string> = {
  en: 'About|Features|FAQ|Contact|Get started|Learn more|CinaSeek · Early access|The intelligent layer.|Clarity for every|decision.|Explore the CinaGroup ecosystem|AI conversations|Where speed meets intelligence.|Model gateway|Your models. One point of control.|A little clarity, before you begin.|Ready to move your|work forward?|Illustrative preview|Ask anything…|Menu|Pause motion|Resume motion|Resources|Legal|Connect|Privacy policy|Terms of service|All rights reserved.|Made by|Built with|Skip to content',
  zh: '关于|功能|常见问题|联系我们|开始使用|了解更多|CinaSeek · 抢先体验|智能层，|助力清晰|决策。|探索海内集团产品生态|AI 对话|速度与智能对话在此交汇。|模型网关|你的模型，统一掌控。|我们为你解答疑惑|准备好推进|下一步了吗？|界面示意|随便问问…|菜单|暂停动画|播放动画|资源|法律|社交|隐私政策|服务条款|保留所有权利。|由|基于|跳到主要内容',
  ja: '概要|機能|よくある質問|お問い合わせ|始める|詳しく見る|CinaSeek · 早期アクセス|インテリジェントな基盤。|すべての判断を、|より明確に。|CinaGroup の製品を見る|AI 対話|スピードと知性が出会う場所。|モデルゲートウェイ|モデルを、一か所で管理。|はじめる前の、よくある質問。|仕事を|次のステップへ。|画面イメージ|何でも聞いてみよう…|メニュー|アニメーションを停止|アニメーションを再開|リソース|法的情報|ソーシャル|プライバシーポリシー|利用規約|無断転載を禁じます。|制作：|構築：|本文へ移動',
  ko: '소개|기능|자주 묻는 질문|문의|시작하기|자세히 보기|CinaSeek · 얼리 액세스|지능적인 연결.|모든 결정을|더 명확하게.|CinaGroup 제품 살펴보기|AI 대화|속도와 지능이 만나는 곳.|모델 게이트웨이|모델 관리를 한곳에서.|시작 전, 궁금한 점을 확인하세요.|업무의|다음 단계로.|화면 예시|무엇이든 물어보세요…|메뉴|애니메이션 중지|애니메이션 재생|리소스|법적 정보|소셜|개인정보 처리방침|이용약관|모든 권리 보유.|제작:|구축:|본문으로 이동',
  ru: 'О нас|Возможности|Вопросы|Контакты|Начать|Подробнее|CinaSeek · Ранний доступ|Интеллектуальная основа.|Ясность каждого|решения.|Откройте экосистему CinaGroup|Диалоги с ИИ|Скорость встречается с интеллектом.|Шлюз моделей|Ваши модели. Единый контроль.|Ответы перед первым шагом.|Готовы двигаться|вперёд?|Пример интерфейса|Спросите о чём угодно…|Меню|Остановить анимацию|Включить анимацию|Ресурсы|Правовая информация|Соцсети|Конфиденциальность|Условия использования|Все права защищены.|Создано|На базе|Перейти к содержанию',
  es: 'Acerca de|Funciones|Preguntas|Contacto|Empezar|Saber más|CinaSeek · Acceso anticipado|La capa inteligente.|Claridad en cada|decisión.|Explora el ecosistema CinaGroup|Conversaciones con IA|Donde la velocidad y la inteligencia se encuentran.|Pasarela de modelos|Tus modelos. Un punto de control.|Un poco de claridad antes de empezar.|¿Listo para dar|el siguiente paso?|Vista ilustrativa|Pregunta lo que quieras…|Menú|Pausar animación|Reanudar animación|Recursos|Legal|Redes|Privacidad|Términos de servicio|Todos los derechos reservados.|Creado por|Creado con|Ir al contenido',
  pt: 'Sobre|Recursos|Perguntas|Contato|Começar|Saiba mais|CinaSeek · Acesso antecipado|A camada inteligente.|Clareza em cada|decisão.|Explore o ecossistema CinaGroup|Conversas com IA|Onde velocidade e inteligência se encontram.|Gateway de modelos|Seus modelos. Um ponto de controle.|Clareza antes de começar.|Pronto para dar|o próximo passo?|Prévia ilustrativa|Pergunte o que quiser…|Menu|Pausar animação|Retomar animação|Recursos|Legal|Redes|Privacidade|Termos de serviço|Todos os direitos reservados.|Criado por|Criado com|Ir para o conteúdo',
  fr: 'À propos|Fonctionnalités|Questions|Contact|Commencer|En savoir plus|CinaSeek · Accès anticipé|La couche intelligente.|Chaque décision,|plus claire.|Explorez l’écosystème CinaGroup|Conversations avec l’IA|La vitesse rencontre l’intelligence.|Passerelle de modèles|Vos modèles. Un seul point de contrôle.|Quelques réponses avant de commencer.|Prêt à faire|avancer votre travail ?|Aperçu illustratif|Posez votre question…|Menu|Suspendre les animations|Reprendre les animations|Ressources|Informations légales|Réseaux|Confidentialité|Conditions d’utilisation|Tous droits réservés.|Créé par|Construit avec|Aller au contenu',
};
const english: Copy = {
  title: 'CinaGroup — An intelligent layer for your work',
  description: 'An agent workspace and model gateway, connected to the way you work.',
  eyebrow: '',
  heroTitle: '',
  heroLead: 'An agent workspace and model gateway, connected to the way you work.',
  explore: 'Explore products',
  contact: 'Talk to us',
  productsEyebrow: 'Products',
  productsTitle: '',
  productsLead: '',
  learn: 'Learn more',
  products: [
    {
      name: 'CinaSeek',
      role: 'Early-access agent workspace',
      description:
        'Bring agent conversations, private Gadgets, and scoped Gatekeepers into one workspace — with context, tools, and models at your side.',
      href: '/cinaseek',
    },
    {
      name: 'CinaClaw',
      role: 'Local-first agent gateway',
      description: 'Run agents through an operator-controlled Gateway, channel adapters, and skills.',
      href: '/cinaclaw',
    },
    {
      name: 'CinaToken',
      role: 'Open-source, self-hosted model gateway',
      description:
        'Manage credentials, routing, usage policies, and budget boundaries in one self-hosted model gateway.',
      href: '/cinatoken',
    },
    {
      name: 'CinaSkill',
      role: 'The CinaClaw SKILL.md format',
      description: 'Package instructions and resources for a CinaClaw workspace.',
      href: '/cinaskill',
    },
    {
      name: 'CinaChain',
      role: 'Base Sepolia NFT DApp beta',
      description: 'Explore an NFT gallery and minting on the Base Sepolia testnet.',
      href: '/cinachain',
    },
  ],
  methodEyebrow: '',
  methodTitle: '',
  methodLead: '',
  methods: [],
  nextEyebrow: '',
  nextTitle: '',
  nextLead: 'A more connected way to think, create, and take action.',
};
const faqCopy: Record<Language, [string, string][]> = {
  en: [
    [
      'What is CinaGroup?',
      'CinaGroup develops agent workspaces, gateways, reusable skills, and testnet applications. Each product has its own scope and release status.',
    ],
    [
      'Where should I start?',
      'Start with CinaSeek for an early-access agent workspace, or CinaToken to explore a self-hosted model gateway. Product pages explain the current scope.',
    ],
    [
      'How is my data handled?',
      'Data handling depends on the product, hosting setup, and connected provider. Review the privacy policy and access boundaries before connecting sensitive information.',
    ],
    [
      'Can I use my existing tools?',
      'Check each product’s documentation for supported integrations. CinaClaw uses channel adapters and skills; CinaToken focuses on model access and routing.',
    ],
    [
      'Is the preview a live service?',
      'No. These are illustrative interface previews, not live AI responses or performance measurements. Follow a product link to explore the actual service or repository.',
    ],
  ],
  zh: [
    [
      '什么是海内集团？',
      '海内集团开发智能体工作空间、网关、可复用技能与测试网应用。各产品的功能范围与发布状态分别说明。',
    ],
    [
      '我应该从哪里开始？',
      '通过 CinaSeek 抢先体验智能体工作空间，或通过 CinaToken 探索自托管模型网关。产品页面提供当前功能说明。',
    ],
    [
      '我的数据如何处理？',
      '数据处理方式取决于产品、部署方式及接入的服务商。连接敏感信息前，请先阅读隐私政策并确认访问边界。',
    ],
    [
      '能接入我现有的工具吗？',
      '请查看具体产品文档了解支持范围。CinaClaw 提供渠道适配器与技能机制，CinaToken 专注模型接入与路由。',
    ],
    [
      '页面中的预览是真实服务吗？',
      '不是。这些是界面示意，不是真实 AI 回复或性能测试。请通过产品链接访问实际服务或代码仓库。',
    ],
  ],
  ja: [
    [
      'CinaGroup とは？',
      'エージェントワークスペース、ゲートウェイ、再利用可能なスキル、テストネットアプリを開発しています。公開状況は製品ごとに異なります。',
    ],
    [
      'どこから始めればよいですか？',
      'ワークスペースは CinaSeek、セルフホスト型モデルゲートウェイは CinaToken をご覧ください。',
    ],
    [
      'データはどう扱われますか？',
      '製品、ホスティング、接続先によって異なります。機密情報を接続する前にプライバシーポリシーとアクセス範囲を確認してください。',
    ],
    [
      '既存ツールと連携できますか？',
      '対応範囲は各製品の文書で確認できます。CinaClaw はアダプターとスキル、CinaToken はモデル接続とルーティングを扱います。',
    ],
    [
      'プレビューは実際のサービスですか？',
      'いいえ。画面イメージであり、実際の AI 応答や性能測定ではありません。製品リンクから実際のサービスやリポジトリをご確認ください。',
    ],
  ],
  ko: [
    [
      'CinaGroup은 무엇인가요?',
      '에이전트 작업 공간, 게이트웨이, 재사용 가능한 스킬 및 테스트넷 앱을 개발합니다. 제품마다 범위와 출시 상태가 다릅니다.',
    ],
    ['어디서 시작하나요?', '작업 공간은 CinaSeek, 자체 호스팅 모델 게이트웨이는 CinaToken에서 확인하세요.'],
    [
      '데이터는 어떻게 처리되나요?',
      '제품, 호스팅 및 연결된 제공업체에 따라 다릅니다. 민감한 정보를 연결하기 전 개인정보 처리방침과 접근 범위를 확인하세요.',
    ],
    [
      '기존 도구와 연결할 수 있나요?',
      '제품 문서에서 지원 범위를 확인하세요. CinaClaw는 어댑터와 스킬을, CinaToken은 모델 연결과 라우팅을 제공합니다.',
    ],
    [
      '미리보기는 실제 서비스인가요?',
      '아닙니다. 실제 AI 응답이나 성능 측정이 아닌 화면 예시입니다. 제품 링크에서 실제 서비스 또는 저장소를 확인하세요.',
    ],
  ],
  ru: [
    [
      'Что такое CinaGroup?',
      'Мы разрабатываем рабочие пространства агентов, шлюзы, навыки и приложения для тестовых сетей. Область применения и статус зависят от продукта.',
    ],
    [
      'С чего начать?',
      'Начните с CinaSeek для работы с агентами или CinaToken для самостоятельного размещения шлюза моделей.',
    ],
    [
      'Как обрабатываются данные?',
      'Это зависит от продукта, хостинга и провайдера. До подключения чувствительной информации изучите политику конфиденциальности и границы доступа.',
    ],
    [
      'Можно подключить свои инструменты?',
      'Поддерживаемые интеграции описаны в документации. CinaClaw использует адаптеры и навыки, CinaToken — доступ к моделям и маршрутизацию.',
    ],
    [
      'Это демонстрация работающего сервиса?',
      'Нет. Это примеры интерфейсов, а не ответы ИИ или замеры производительности. Ссылки на продукты ведут к сервисам или репозиториям.',
    ],
  ],
  es: [
    [
      '¿Qué es CinaGroup?',
      'Desarrollamos espacios de trabajo con agentes, pasarelas, habilidades reutilizables y aplicaciones de testnet. El alcance y estado varían por producto.',
    ],
    [
      '¿Por dónde empiezo?',
      'Explora CinaSeek para trabajar con agentes o CinaToken para una pasarela de modelos autoalojada.',
    ],
    [
      '¿Cómo se tratan mis datos?',
      'Depende del producto, alojamiento y proveedor conectado. Revisa la política de privacidad y los límites de acceso antes de conectar datos sensibles.',
    ],
    [
      '¿Puedo usar mis herramientas?',
      'Consulta las integraciones en la documentación. CinaClaw usa adaptadores y habilidades; CinaToken se centra en acceso y enrutamiento de modelos.',
    ],
    [
      '¿La vista previa es un servicio real?',
      'No. Son ilustraciones de interfaz, no respuestas de IA ni mediciones. Los enlaces llevan al servicio o repositorio real.',
    ],
  ],
  pt: [
    [
      'O que é a CinaGroup?',
      'Desenvolvemos espaços de trabalho com agentes, gateways, habilidades reutilizáveis e aplicativos de testnet. O escopo e o estágio variam por produto.',
    ],
    [
      'Por onde começar?',
      'Explore o CinaSeek para trabalhar com agentes ou o CinaToken para um gateway de modelos auto-hospedado.',
    ],
    [
      'Como meus dados são tratados?',
      'Depende do produto, hospedagem e provedor conectado. Confira a política de privacidade e os limites de acesso antes de conectar informações sensíveis.',
    ],
    [
      'Posso usar minhas ferramentas?',
      'Consulte as integrações na documentação. O CinaClaw usa adaptadores e habilidades; o CinaToken foca no acesso e roteamento de modelos.',
    ],
    [
      'A prévia é um serviço real?',
      'Não. São ilustrações de interface, não respostas de IA ou medições de desempenho. Os links levam ao serviço ou repositório real.',
    ],
  ],
  fr: [
    [
      'Qu’est-ce que CinaGroup ?',
      'Nous développons des espaces de travail d’agents, des passerelles, des compétences réutilisables et des applications de testnet. Le périmètre et le statut varient selon le produit.',
    ],
    [
      'Par où commencer ?',
      'Explorez CinaSeek pour travailler avec des agents, ou CinaToken pour une passerelle de modèles auto-hébergée.',
    ],
    [
      'Comment mes données sont-elles traitées ?',
      'Cela dépend du produit, de l’hébergement et du fournisseur connecté. Consultez la politique de confidentialité et les limites d’accès avant de connecter des données sensibles.',
    ],
    [
      'Puis-je utiliser mes outils actuels ?',
      'Consultez les intégrations documentées. CinaClaw utilise des adaptateurs et des compétences ; CinaToken gère l’accès aux modèles et le routage.',
    ],
    [
      'L’aperçu est-il un service réel ?',
      'Non. Ce sont des illustrations d’interface, pas des réponses d’IA ni des mesures de performance. Les liens mènent aux services ou dépôts réels.',
    ],
  ],
};

function Mark({ kind = 0, className = '' }: { kind?: number; className?: string }) {
  const paths = [
    'M22 6a10 10 0 1 0 0 20M22 11a5 5 0 1 0 0 10M30 6a10 10 0 1 0 0 20M30 11a5 5 0 1 0 0 10',
    'm16 3 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z',
    'M5 10 16 4l11 6v12l-11 6-11-6ZM5 10l11 6 11-6M16 16v12',
    'M5 8c0-6 22-6 22 0s-22 6-22 0Zm0 0v8c0 6 22 6 22 0V8M5 16v8c0 6 22 6 22 0v-8',
    'M16 4 29 28H3Z',
    'M19 16a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  ];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 34 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-8 w-9 shrink-0 ${className}`}
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function Arrow() {
  return (
    <span aria-hidden="true" className="text-lg leading-none">
      →
    </span>
  );
}
function FadeInUp({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    // SSR and no-JS remain visible; only offscreen elements are staged for reveal.
    if (node.getBoundingClientRect().top > window.innerHeight) node.dataset.reveal = 'waiting';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.reveal = 'visible';
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`cg-reveal ${className}`}>
      {children}
    </div>
  );
}
const videoUrls = [
  '50b4f304-cdca-4e12-8735-580d225834be',
  '1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac',
  '736fd4a0-70ac-4f44-9633-55769ead6aca',
].map((id) => `https://cdn.sceneai.art/Hero%20Section%20Video/${id}.mp4`);
function Backdrop({ index = 0, paused, hero = false }: { index?: number; paused: boolean; hero?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let visible = false;
    const sync = () => {
      if (!paused && !motion.matches && !connection?.saveData && visible && !document.hidden) {
        if (!video.getAttribute('src')) video.src = videoUrls[index];
        void video.play().catch(() => {});
      } else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(video);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [index, paused]);
  return (
    <div
      aria-hidden="true"
      className={`cg-backdrop absolute inset-0 -z-10 overflow-hidden ${hero ? 'cg-backdrop-hero' : ''}`}
    >
      <img
        src="/images/landing/silver-flow.webp"
        alt=""
        loading={hero ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-cover ${failed ? 'hidden' : ''}`}
      />
      <div
        className={`absolute inset-0 ${hero ? 'bg-gradient-to-b from-black/30 via-black/10 to-black' : 'bg-black/20'}`}
      />
    </div>
  );
}

export default function CinaLanding({ lang = 'en' }: { lang?: Language }) {
  const c = lang === 'en' ? english : copy[lang];
  const [
    about,
    features,
    faq,
    contact,
    start,
    learn,
    badge,
    heroA,
    heroB,
    accent,
    ecosystem,
    chat,
    chatHeading,
    gateway,
    gatewayHeading,
    faqHeading,
    ctaA,
    ctaB,
    preview,
    placeholder,
    menuLabel,
    pauseLabel,
    resumeLabel,
    resources,
    legal,
    social,
    privacy,
    terms,
    rights,
    made,
    built,
    skip,
  ] = labels[lang].split('|');
  const [menu, setMenu] = useState(false),
    [scrolled, setScrolled] = useState(false),
    [paused, setPaused] = useState(false),
    [tab, setTab] = useState(0),
    [openFaq, setOpenFaq] = useState<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const base = lang === 'en' ? '' : `/${lang}`;
  const seek = c.products[0],
    token = c.products[2];
  const nav = [
    [about, 'about'],
    [features, 'features'],
    [faq, 'faq'],
    [contact, 'contact'],
  ];
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu) {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [menu]);
  const buttons = (primary = seek.href) => (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <a className="cg-pill cg-primary" href={`${primary}/`}>
        {start}
        <Arrow />
      </a>
      <a className="cg-pill cg-secondary" href="#features">
        {learn}
      </a>
    </div>
  );
  return (
    <div className={`cg-landing bg-black text-white ${paused ? 'cg-paused' : ''}`} data-landing-theme="fixed-dark">
      <style>{styles}</style>
      <a className="cg-skip" href="#main-content">
        {skip}
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled || menu ? 'border-b border-white/10 bg-black/80 backdrop-blur-md' : 'bg-transparent'}`}
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-6">
          <a
            href={`${base}/`}
            aria-label={lang === 'zh' ? '海内集团首页' : 'CinaGroup'}
            className="flex items-center gap-2 text-xl font-semibold tracking-tight"
          >
            <Mark />
            {lang === 'zh' ? '海内集团' : 'CinaGroup'}
          </a>
          <nav aria-label={menuLabel} className="hidden items-center gap-8 lg:flex">
            {nav.map(([label, id]) => (
              <a
                className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
                key={id}
                href={`#${id}`}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <details className="cg-language relative">
              <summary aria-label="Language" className="cursor-pointer text-sm text-gray-300">
                ◎ <span className="hidden sm:inline">{locales.find(([id]) => id === lang)?.[1]}</span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="absolute right-0 top-10 grid w-40 gap-1 rounded-xl border border-white/10 bg-[#151517] p-2 shadow-xl">
                {locales.map(([id, label]) => (
                  <a
                    key={id}
                    href={id === 'en' ? '/' : `/${id}/`}
                    hrefLang={id}
                    lang={id}
                    aria-current={id === lang ? 'page' : undefined}
                    className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </details>
            <div className="hidden sm:block">
              <a href={`${seek.href}/`} className="cg-pill cg-secondary">
                {start}
                <Arrow />
              </a>
            </div>
            <button
              ref={menuButton}
              aria-label={menuLabel}
              aria-expanded={menu}
              aria-controls="cg-mobile-menu"
              onClick={() => setMenu(!menu)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 lg:hidden"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d={menu ? 'm6 6 12 12M6 18 18 6' : 'M4 8h16M4 16h16'} />
              </svg>
            </button>
          </div>
        </div>
        <div id="cg-mobile-menu" className={`cg-collapse lg:hidden ${menu ? 'cg-open' : ''}`} inert={!menu}>
          <nav className="min-h-0 overflow-hidden px-6" aria-label={menuLabel}>
            {nav.map(([label, id]) => (
              <a
                key={id}
                onClick={() => setMenu(false)}
                href={`#${id}`}
                className="block border-t border-white/10 py-4 text-gray-300"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section
          id="about"
          className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-32"
        >
          <Backdrop hero paused={paused} />
          <FadeInUp className="relative mx-auto w-full max-w-5xl text-center">
            <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-sm">
              <span className="text-violet-200" aria-hidden="true">
                ✦
              </span>
              {badge}
            </p>
            <h1 className="mb-6 text-5xl font-medium tracking-tight md:text-7xl">
              <span className="block">{heroA}</span>
              <span className="block">
                {heroB} <span className="cg-serif">{accent}</span>
              </span>
            </h1>
            <p className="mx-auto mb-9 max-w-2xl text-[16px] leading-relaxed text-gray-400">{c.heroLead}</p>
            {buttons()}
          </FadeInUp>
          <div className="mt-24 w-full max-w-7xl">
            <p className="mb-8 text-center text-sm font-medium text-gray-400">{ecosystem}</p>
            <div className="cg-marquee overflow-hidden">
              <div className="cg-marquee-track flex w-max">
                {[0, 1, 2, 3].map((group) => (
                  <div key={group} className="flex shrink-0" aria-hidden={group > 0 ? true : undefined}>
                    {c.products.map((product, i) => (
                      <a
                        key={product.name}
                        href={`${product.href}/`}
                        tabIndex={group > 0 ? -1 : 0}
                        className="flex shrink-0 items-center gap-4 px-8 py-3 text-lg text-gray-300 transition-colors hover:text-white"
                      >
                        <Mark kind={i + 1} />
                        {product.name}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            className="mt-9 rounded-full border border-white/10 px-3 py-2 text-xs text-gray-400 transition-colors hover:text-white"
          >
            {paused ? resumeLabel : pauseLabel} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
          </button>
        </section>
        <section id="features" className="border-t border-white/5">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 lg:grid-cols-2">
            <FadeInUp>
              <p className="mb-5 flex items-center gap-3 text-sm font-medium text-yellow-300">
                <span aria-hidden="true">✦</span>
                {chat}
              </p>
              <h2 className="mb-6 max-w-lg text-4xl font-semibold tracking-tight md:text-5xl">{chatHeading}</h2>
              <p className="mb-8 max-w-lg text-base leading-relaxed text-gray-400">{seek.description}</p>
              <a href={`${seek.href}/`} className="cg-pill cg-primary">
                {learn} CinaSeek
                <Arrow />
              </a>
            </FadeInUp>
            <FadeInUp>
              <div className="cg-preview relative isolate flex min-h-[390px] flex-col justify-center overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-8">
                <Backdrop index={1} paused={paused} />
                <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
                  <div
                    className="mx-auto mb-8 flex w-fit gap-1 rounded-full border border-white/10 bg-black/20 p-1"
                    role="tablist"
                    aria-label={chat}
                  >
                    {[chat, 'Gadgets', 'Gatekeepers'].map((label, i) => (
                      <button
                        id={`cg-tab-${i}`}
                        aria-controls="cg-tab-panel"
                        role="tab"
                        aria-selected={tab === i}
                        tabIndex={tab === i ? 0 : -1}
                        key={label}
                        onClick={() => setTab(i)}
                        onKeyDown={(e) => {
                          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                            e.preventDefault();
                            const next =
                              e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (tab + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
                            setTab(next);
                            document.getElementById(`cg-tab-${next}`)?.focus();
                          }
                        }}
                        className={`min-w-0 rounded-full px-2 py-2 text-xs transition-colors sm:px-3 ${tab === i ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    id="cg-tab-panel"
                    role="tabpanel"
                    aria-labelledby={`cg-tab-${tab}`}
                    tabIndex={0}
                    className="flex min-h-28 items-center justify-center pb-6 text-center text-base leading-relaxed text-gray-200"
                  >
                    {tab === 0 ? chatHeading : tab === 1 ? seek.description : faqCopy[lang][2][1]}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-full border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-400">
                    <span>{placeholder}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 40 24"
                      className="h-6 w-10 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M6 9v6a3 3 0 0 0 6 0V9a3 3 0 0 0-6 0Zm-3 5v1a6 6 0 0 0 12 0v-1M9 21v2m16-14v6m4-10v14m4-17v20m4-15v10" />
                    </svg>
                  </div>
                </div>
                <p className="mt-5 text-xs text-gray-300">{preview}</p>
              </div>
            </FadeInUp>
          </div>
        </section>
        <section className="border-y border-white/5">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 lg:grid-cols-2">
            <FadeInUp className="order-2 lg:order-1">
              <div className="cg-preview relative isolate flex min-h-[390px] flex-col justify-center overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-8">
                <Backdrop index={2} paused={paused} />
                <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-6 shadow-2xl backdrop-blur-xl">
                  <div className="mb-7 flex items-center gap-3 border-b border-white/10 pb-5">
                    <Mark kind={3} />
                    <div>
                      <p className="text-base font-medium">CinaToken</p>
                      <p className="mt-1 text-xs text-gray-400">{gateway}</p>
                    </div>
                    <span aria-hidden="true" className="ml-auto h-2 w-2 rounded-full bg-emerald-300" />
                  </div>
                  <div aria-hidden="true" className="mb-7 flex h-12 items-center justify-between gap-0.5">
                    {Array.from({ length: 38 }, (_, i) => (
                      <span
                        key={i}
                        className="cg-wave w-1 rounded-full bg-emerald-100/70"
                        style={{
                          height: `${Math.round(12 + Math.sin(i * 1.7) ** 2 * 32)}px`,
                          animationDelay: `${i * 65}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-base leading-relaxed text-gray-200">{token.description}</p>
                  <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-gray-400">
                    <span>API</span>
                    <span aria-hidden="true">→</span>
                    <span>CinaToken</span>
                    <span aria-hidden="true">→</span>
                    <span>LLM</span>
                  </div>
                </div>
                <p className="mt-5 text-xs text-gray-300">{preview}</p>
              </div>
            </FadeInUp>
            <FadeInUp className="order-1 lg:order-2">
              <p className="mb-5 flex items-center gap-3 text-sm font-medium text-emerald-300">
                <span aria-hidden="true">✧</span>
                {gateway}
              </p>
              <h2 className="mb-6 max-w-lg text-4xl font-semibold tracking-tight md:text-5xl">{gatewayHeading}</h2>
              <p className="mb-8 max-w-lg text-base leading-relaxed text-gray-400">{token.description}</p>
              <a href={`${token.href}/`} className="cg-pill cg-primary">
                {learn} CinaToken
                <Arrow />
              </a>
            </FadeInUp>
          </div>
        </section>
        <section id="faq" className="mx-auto max-w-3xl px-6 py-32">
          <FadeInUp>
            <h2 className="mb-12 text-center text-4xl font-semibold tracking-tight md:text-5xl">{faqHeading}</h2>
            <div className="rounded-xl border border-white/10 bg-transparent">
              {faqCopy[lang].map(([question, answer], i) => (
                <div key={question} className={i < 4 ? 'border-b border-white/10' : ''}>
                  <h3>
                    <button
                      id={`cg-faq-question-${i}`}
                      aria-expanded={openFaq === i}
                      aria-controls={`cg-faq-answer-${i}`}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left text-base font-medium"
                    >
                      <span>{question}</span>
                      <span
                        aria-hidden="true"
                        className={`text-2xl font-light transition-transform duration-300 ${openFaq === i ? 'rotate-45' : ''}`}
                      >
                        +
                      </span>
                    </button>
                  </h3>
                  <div
                    id={`cg-faq-answer-${i}`}
                    role="region"
                    aria-labelledby={`cg-faq-question-${i}`}
                    className={`cg-collapse ${openFaq === i ? 'cg-open' : ''}`}
                    inert={openFaq !== i}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <p className="px-6 pb-6 text-sm leading-relaxed text-gray-400">{answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </FadeInUp>
        </section>
      </main>
      <footer id="contact" className="relative isolate overflow-hidden border-t border-white/5 px-6 pb-10 pt-32">
        <Backdrop hero paused={paused} />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/60 to-black" />
        <FadeInUp className="mx-auto mb-32 max-w-3xl text-center">
          <h2 className="mb-8 text-4xl font-medium tracking-tight md:text-5xl">
            {ctaA} <span className="cg-serif">{ctaB}</span>
          </h2>
          <p className="mb-8 text-base text-gray-400">{c.nextLead}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a className="cg-pill cg-primary" href={`${seek.href}/`}>
              {start}
              <Arrow />
            </a>
            <a className="cg-pill cg-secondary" href={`${base}/contact/`}>
              {contact}
            </a>
          </div>
        </FadeInUp>
        <div className="mx-auto mb-24 grid max-w-7xl grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <a href={`${base}/`} className="mb-5 flex items-center gap-2 text-xl font-bold">
              <Mark />
              {lang === 'zh' ? '海内集团' : 'CinaGroup'}
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-gray-400">{c.description}</p>
          </div>
          <div>
            <h3 className="mb-5 text-sm font-medium">{c.productsEyebrow.replace(/[。.]/g, '')}</h3>
            <ul className="space-y-3">
              {c.products.map((p) => (
                <li key={p.name}>
                  <a className="cg-footer-link" href={`${p.href}/`}>
                    {p.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-5 text-sm font-medium">{resources}</h3>
            <ul className="space-y-3">
              <li>
                <a className="cg-footer-link" href={`${base}/about/`}>
                  {about}
                </a>
              </li>
              <li>
                <a className="cg-footer-link" href={`${lang === 'zh' || lang === 'ja' ? base : ''}/blog/`}>
                  {lang === 'zh' ? '博客' : 'Blog'}
                </a>
              </li>
              <li>
                <a className="cg-footer-link" href={`${base}/contact/`}>
                  {contact}
                </a>
              </li>
              <li>
                <a className="cg-footer-link" href={`${base}/privacy/`}>
                  {privacy}
                </a>
              </li>
              <li>
                <a className="cg-footer-link" href={`${base}/terms/`}>
                  {terms}
                </a>
              </li>
            </ul>
            <span className="sr-only">{legal}</span>
          </div>
          <div>
            <h3 className="mb-5 text-sm font-medium">{social}</h3>
            <ul className="space-y-3">
              {[
                ['GitHub', 'https://github.com/cinagroup'],
                ['Twitter / X', 'https://x.com/cinagroup'],
                ['Instagram', 'https://www.instagram.com/cinaseek/'],
                ['TikTok', 'https://tiktok.com/@cinaseek'],
              ].map(([label, url]) => (
                <li key={label}>
                  <a className="cg-footer-link" href={url}>
                    {label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 border-t border-white/5 pt-8 text-center text-xs text-gray-400 md:flex-row">
          <p>
            © 2026 CinaGroup{lang === 'zh' ? '。 ' : '. '}
            {rights}
          </p>
          <p>
            {made} <span className="text-gray-300">CinaGroup</span>
            {lang === 'zh' ? '制作。 ' : '. '}
            {built} <span className="text-gray-300">Gemini</span>
            {lang === 'zh' ? ' 构建。' : '.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
const styles = `
html:has(.cg-landing){scroll-behavior:smooth;font-size:16px;scroll-padding-top:96px;background:#000}
.cg-landing{color-scheme:dark;font-family:'Inter Variable',Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5;overflow-wrap:break-word}
.cg-landing h1,.cg-landing h2,.cg-landing h3{font-family:inherit;color:inherit;line-height:1.12}
.cg-landing h1{letter-spacing:-.055em}.cg-landing h2{letter-spacing:-.045em}.cg-landing .cg-serif{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-style:italic;letter-spacing:-.055em}
.cg-landing a,.cg-landing button,.cg-landing summary{-webkit-tap-highlight-color:transparent}.cg-landing :focus-visible{outline:2px solid #c4b5fd;outline-offset:5px}
.cg-pill{display:inline-flex;align-items:center;justify-content:center;gap:12px;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:500;line-height:20px;transition:background .2s,transform .2s;border:1px solid transparent}.cg-pill:hover{transform:translateY(-2px)}.cg-primary{background:#fff;color:#000}.cg-primary:hover{background:#e5e5e5}.cg-secondary{background:#1f1f22;color:#fff;border-color:rgb(255 255 255/.05)}.cg-secondary:hover{background:#2a2a2d}
.cg-footer-link{font-size:14px;color:#9ca3af;transition:color .2s}.cg-footer-link:hover{color:#fff}
.cg-reveal{min-width:0;transition:opacity 1000ms ease,transform 1000ms cubic-bezier(.2,.65,.3,1)}.cg-reveal[data-reveal=waiting]{opacity:0;transform:translateY(40px)}
.cg-collapse{display:grid;grid-template-rows:0fr;visibility:hidden;transition:grid-template-rows .35s ease,visibility .35s}.cg-collapse.cg-open{grid-template-rows:1fr;visibility:visible}
.cg-marquee{mask-image:linear-gradient(to right,transparent,#000 8%,#000 92%,transparent)}.cg-marquee-track{animation:cg-marquee 30s linear infinite}.cg-marquee:focus-within .cg-marquee-track,.cg-marquee:hover .cg-marquee-track{animation-play-state:paused}@keyframes cg-marquee{to{transform:translateX(-25%)}}
.cg-wave{animation:cg-wave 2.2s ease-in-out infinite alternate}@keyframes cg-wave{to{transform:scaleY(.45)}}.cg-paused *{animation-play-state:paused!important}
.cg-backdrop{background:#0a0a0d}.cg-backdrop-hero{background:#000}.cg-backdrop video{opacity:.9}.cg-silk{position:absolute;inset:-20%;background:radial-gradient(ellipse at 70% 40%,#25212f 0%,transparent 45%),radial-gradient(ellipse at 15% 60%,#3c3a46 0%,transparent 35%);opacity:.6}.cg-preview{background:#101014}.cg-language summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:44px}.cg-language summary::-webkit-details-marker{display:none}.cg-skip{position:fixed;top:12px;left:12px;z-index:100;background:white;color:black;padding:12px;transform:translateY(-200%)}.cg-skip:focus{transform:none}
@media(max-width:639px){.cg-landing h1{font-size:42px;line-height:1.1}.cg-landing h2{font-size:34px}.cg-landing .cg-preview{min-height:350px}.cg-pill{padding:11px 18px}.cg-backdrop-hero img{object-position:20% center;opacity:.55}}
@media(prefers-reduced-motion:reduce){html:has(.cg-landing){scroll-behavior:auto}.cg-landing *, .cg-landing *::before,.cg-landing *::after{animation:none!important;transition:none!important}.cg-reveal[data-reveal=waiting]{opacity:1;transform:none}.cg-backdrop video{visibility:hidden}}
`;
