import { resolveLocale } from '@emdash-cms/admin/locales/config';

type JsonRecord = Record<string, unknown>;
type Translations = readonly [string, string, string, string, string, string];
type KnownCollection = {
  label: string;
  labelSingular: string;
  description: string;
  fields: Record<string, string>;
  subFields?: Record<string, Record<string, string>>;
};

const LOCALES = ['zh-CN', 'zh-TW', 'ja', 'es-ES', 'pt-BR', 'fr'] as const;
const MAX_MANIFEST_BYTES = 512 * 1024;
const INNER_DESCRIPTION =
  'Existing localized public copy. Evidence, disclosures, form submission and illustrative qualifiers stay code controlled.';

// Presentation-only copies of the reviewed seed metadata. Slugs and original
// labels must both match; renamed or newly created fields remain authored text.
const KNOWN_COLLECTIONS: Record<string, KnownCollection> = {
  site_profile: {
    label: 'Site Presentation',
    labelSingular: 'Site Presentation',
    description:
      'Public contact, footer and brand presentation. Global site identity and social/SEO settings are in Settings; navigation is in Menus.',
    fields: {
      title: 'Entry name',
      site_name: 'Localized default site name',
      tagline: 'Localized site description',
      contact_email: 'Public contact email',
      footer_description: 'Footer introduction',
      header_cta_label: 'Header contact button label',
      header_cta_href: 'Header contact button URL',
      logo_dark: 'Logo for dark backgrounds',
      extra_social_links: 'Additional social links',
    },
    subFields: { extra_social_links: { label: 'Label', url: 'URL', icon: 'Icon' } },
  },
  site_pages: {
    label: 'Website Pages',
    labelSingular: 'Website Page',
    description:
      'Homepage presentation content. Each locale is edited and published independently. This is separate from Journal Posts and their editorial policy.',
    fields: {
      title: 'SEO — Page title',
      description: 'SEO — Page description',
      hero_eyebrow: 'Hero — Eyebrow',
      hero_title: 'Hero — Heading',
      hero_lead: 'Hero — Introduction',
      hero_image: 'Hero / About detail — Photo (original city photo when empty)',
      explore_label: 'Hero — Product button label',
      explore_url: 'Hero — Product button path or anchor',
      contact_label: 'Contact — Button label',
      contact_url: 'Contact — Button path',
      products_eyebrow: 'Products — Eyebrow',
      products_title: 'Products — Heading',
      products_lead: 'Products — Introduction',
      products: 'Products — Cards',
      learn_label: 'Products / About — Learn more label',
      about_url: 'About — Learn more path',
      about_image: 'About / Secondary slide — Photo (original office photo when empty)',
      method_eyebrow: 'Method — Eyebrow',
      method_title: 'Method — Heading',
      method_lead: 'Method — Introduction',
      methods: 'Method — Steps',
      next_eyebrow: 'Next step — Eyebrow',
      next_title: 'Next step — Heading',
      next_lead: 'Next step — Introduction',
    },
    subFields: {
      products: {
        name: 'Product name',
        role: 'Product role / status',
        description: 'Product description',
        href: 'Product page path',
      },
      methods: { title: 'Step heading', description: 'Step explanation' },
    },
  },
  page_about: {
    label: 'About Page',
    labelSingular: 'About Page',
    description: INNER_DESCRIPTION,
    fields: {
      title: 'title',
      description: 'description',
      eyebrow: 'eyebrow',
      hero_title: 'hero Title',
      lead: 'lead',
      services: 'services',
      contact: 'contact',
      mission_eyebrow: 'mission Eyebrow',
      mission_title: 'mission Title',
      mission_text: 'mission Text',
      principles: 'principles',
      products_eyebrow: 'products Eyebrow',
      products_title: 'products Title',
      products_text: 'products Text',
      product_descriptions_cinaseek: 'product Descriptions / cinaseek',
      product_descriptions_cinaclaw: 'product Descriptions / cinaclaw',
      product_descriptions_cinatoken: 'product Descriptions / cinatoken',
      product_descriptions_cinaskill: 'product Descriptions / cinaskill',
      product_descriptions_cinachain: 'product Descriptions / cinachain',
      next_eyebrow: 'next Eyebrow',
      next_title: 'next Title',
      next_text: 'next Text',
    },
    subFields: { principles: { label: 'label', title: 'title', text: 'text' } },
  },
  page_services: {
    label: 'Services Page',
    labelSingular: 'Services Page',
    description: INNER_DESCRIPTION,
    fields: {
      metadata_title: 'metadata Title',
      eyebrow: 'eyebrow',
      title: 'title',
      lead: 'lead',
      primary: 'primary',
      secondary: 'secondary',
      section_eyebrow: 'section Eyebrow',
      section_title: 'section Title',
      section_lead: 'section Lead',
      cards: 'cards',
      process_eyebrow: 'process Eyebrow',
      process_title: 'process Title',
      steps: 'steps',
    },
    subFields: {
      cards: { label: 'label', title: 'title', description: 'description' },
      steps: { title: 'title', description: 'description' },
    },
  },
  page_contact: {
    label: 'Contact Page',
    labelSingular: 'Contact Page',
    description: INNER_DESCRIPTION,
    fields: {
      title: 'title',
      description: 'description',
      eyebrow: 'eyebrow',
      hero_title: 'hero Title',
      hero_lead: 'hero Lead',
      email: 'email',
      services: 'services',
      context_eyebrow: 'context Eyebrow',
      context_title: 'context Title',
      context_lead: 'context Lead',
      items: 'items',
      direct_eyebrow: 'direct Eyebrow',
      direct_title: 'direct Title',
      direct_lead: 'direct Lead',
      privacy: 'privacy',
      terms_label: 'terms',
    },
    subFields: { items: { label: '0', description: '1' } },
  },
  page_pricing: {
    label: 'Pricing Page',
    labelSingular: 'Pricing Page',
    description: INNER_DESCRIPTION,
    fields: {
      metadata_title: 'metadata Title',
      eyebrow: 'eyebrow',
      title: 'title',
      lead: 'lead',
      primary: 'primary',
      secondary: 'secondary',
      section_eyebrow: 'section Eyebrow',
      section_title: 'section Title',
      section_lead: 'section Lead',
      cards: 'cards',
      factors_eyebrow: 'factors Eyebrow',
      factors_title: 'factors Title',
      factors: 'factors',
    },
    subFields: {
      cards: { label: 'label', title: 'title', description: 'description', items: 'items (one item per line)' },
      factors: { title: 'title', description: 'description' },
    },
  },
  page_products: {
    label: 'Product Pages',
    labelSingular: 'Product Pages',
    description: INNER_DESCRIPTION,
    fields: {
      contact: 'contact',
      stack: 'stack',
      capabilities_eyebrow: 'capabilities Eyebrow',
      capabilities_title: 'capabilities Title',
      capabilities_lead: 'capabilities Lead',
      workflow_eyebrow: 'workflow Eyebrow',
      workflow_title: 'workflow Title',
      steps: 'steps',
      next_eyebrow: 'next Eyebrow',
      next_title: 'next Title',
      eyebrow: 'eyebrow',
      title: 'title',
      lead: 'lead',
      capabilities: 'capabilities',
    },
    subFields: {
      steps: { title: 'title', description: 'description' },
      capabilities: { title: 'title', description: 'description' },
    },
  },
  page_english: {
    label: 'English Marketing Pages',
    labelSingular: 'English Marketing Page',
    description:
      'Edit the named plain text values, then publish. Signed preview shows drafts at the existing English route. SEO panel controls head metadata; URLs and evidence/disclosure logic remain fixed.',
    fields: { title: 'SEO / Page title', texts: 'Page text / named locations' },
    subFields: {
      texts: { key: 'Binding key (keep unchanged)', label: 'Text location', value: 'Text (plain text only)' },
    },
  },
};

// Ordered zh-CN, zh-TW, ja, es-ES/es-419, pt-BR, fr. English and
// unsupported native admin locales retain their original metadata.
const TEXT: Record<string, Translations> = {
  Website: ['网站', '網站', 'ウェブサイト', 'Sitio web', 'Site', 'Site web'],
  'Site Presentation': [
    '站点展示',
    '網站呈現',
    'サイト表示',
    'Presentación del sitio',
    'Apresentação do site',
    'Présentation du site',
  ],
  'Website Pages': ['网站首页', '網站首頁', 'ホームページ', 'Páginas de inicio', 'Páginas iniciais', 'Pages d’accueil'],
  'Website Page': ['网站首页', '網站首頁', 'ホームページ', 'Página de inicio', 'Página inicial', 'Page d’accueil'],
  'About Page': [
    '关于页面',
    '關於頁面',
    '会社紹介ページ',
    'Página de presentación',
    'Página sobre',
    'Page de présentation',
  ],
  'Services Page': [
    '服务页面',
    '服務頁面',
    'サービスページ',
    'Página de servicios',
    'Página de serviços',
    'Page des services',
  ],
  'Contact Page': [
    '联系页面',
    '聯絡頁面',
    'お問い合わせページ',
    'Página de contacto',
    'Página de contato',
    'Page de contact',
  ],
  'Pricing Page': ['报价页面', '報價頁面', '料金ページ', 'Página de precios', 'Página de preços', 'Page des tarifs'],
  'Product Pages': [
    '产品页面',
    '產品頁面',
    '製品ページ',
    'Páginas de productos',
    'Páginas de produtos',
    'Pages des produits',
  ],
  'English Marketing Pages': [
    '英文营销页面',
    '英文行銷頁面',
    '英語のマーケティングページ',
    'Páginas de marketing en inglés',
    'Páginas de marketing em inglês',
    'Pages marketing en anglais',
  ],
  'English Marketing Page': [
    '英文营销页面',
    '英文行銷頁面',
    '英語のマーケティングページ',
    'Página de marketing en inglés',
    'Página de marketing em inglês',
    'Page marketing en anglais',
  ],
  'Entry name': ['条目名称', '項目名稱', '項目名', 'Nombre de la entrada', 'Nome da entrada', 'Nom de l’entrée'],
  'Localized default site name': [
    '本语言默认站点名称',
    '本語言預設網站名稱',
    'この言語の既定サイト名',
    'Nombre predeterminado del sitio en este idioma',
    'Nome padrão do site neste idioma',
    'Nom du site par défaut dans cette langue',
  ],
  'Localized site description': [
    '本语言站点说明',
    '本語言網站說明',
    'この言語のサイト説明',
    'Descripción del sitio en este idioma',
    'Descrição do site neste idioma',
    'Description du site dans cette langue',
  ],
  'Public contact email': [
    '公开联系邮箱',
    '公開聯絡信箱',
    '公開連絡先メール',
    'Correo de contacto público',
    'E-mail público de contato',
    'E-mail de contact public',
  ],
  'Footer introduction': [
    '页脚介绍',
    '頁尾介紹',
    'フッターの紹介文',
    'Introducción del pie de página',
    'Introdução do rodapé',
    'Introduction du pied de page',
  ],
  'Header contact button label': [
    '页头联系按钮文字',
    '頁首聯絡按鈕文字',
    'ヘッダーの連絡ボタン文言',
    'Texto del botón de contacto de cabecera',
    'Texto do botão de contato do cabeçalho',
    'Texte du bouton de contact en en-tête',
  ],
  'Header contact button URL': [
    '页头联系按钮链接',
    '頁首聯絡按鈕連結',
    'ヘッダーの連絡ボタンURL',
    'URL del botón de contacto de cabecera',
    'URL do botão de contato do cabeçalho',
    'URL du bouton de contact en en-tête',
  ],
  'Logo for dark backgrounds': [
    '深色背景标志',
    '深色背景標誌',
    '暗い背景用のロゴ',
    'Logotipo para fondos oscuros',
    'Logotipo para fundos escuros',
    'Logo pour les fonds sombres',
  ],
  'Additional social links': [
    '其他社交链接',
    '其他社群連結',
    '追加のソーシャルリンク',
    'Enlaces sociales adicionales',
    'Links sociais adicionais',
    'Liens sociaux supplémentaires',
  ],
  Label: ['标签', '標籤', 'ラベル', 'Etiqueta', 'Rótulo', 'Libellé'],
  URL: ['URL', 'URL', 'URL', 'URL', 'URL', 'URL'],
  Icon: ['图标', '圖示', 'アイコン', 'Icono', 'Ícone', 'Icône'],
  'SEO — Page title': [
    'SEO — 页面标题',
    'SEO — 頁面標題',
    'SEO — ページタイトル',
    'SEO — Título de la página',
    'SEO — Título da página',
    'SEO — Titre de la page',
  ],
  'SEO — Page description': [
    'SEO — 页面描述',
    'SEO — 頁面描述',
    'SEO — ページ説明',
    'SEO — Descripción de la página',
    'SEO — Descrição da página',
    'SEO — Description de la page',
  ],
  Hero: ['首屏', '首屏', 'メインビジュアル', 'Portada', 'Destaque', 'Bannière principale'],
  Eyebrow: ['小标题', '小標題', '補助見出し', 'Antetítulo', 'Antetítulo', 'Surtitre'],
  Heading: ['标题', '標題', '見出し', 'Título', 'Título', 'Titre'],
  Introduction: ['介绍', '介紹', '紹介文', 'Introducción', 'Introdução', 'Introduction'],
  'Hero / About detail — Photo (original city photo when empty)': [
    '首屏／关于详情 — 图片（留空使用原城市图片）',
    '首屏／關於詳情 — 圖片（留空使用原城市圖片）',
    'メイン／会社紹介 — 写真（未設定時は元の都市写真）',
    'Portada / Presentación — Foto (vacío: foto original de la ciudad)',
    'Destaque / Sobre — Foto (vazio: foto original da cidade)',
    'Bannière / Présentation — Photo (vide : photo originale de la ville)',
  ],
  'Product button label': [
    '产品按钮文字',
    '產品按鈕文字',
    '製品ボタンの文言',
    'Texto del botón de productos',
    'Texto do botão de produtos',
    'Texte du bouton des produits',
  ],
  'Product button path or anchor': [
    '产品按钮路径或锚点',
    '產品按鈕路徑或錨點',
    '製品ボタンのパスまたはアンカー',
    'Ruta o ancla del botón de productos',
    'Caminho ou âncora do botão de produtos',
    'Chemin ou ancre du bouton des produits',
  ],
  Contact: ['联系', '聯絡', 'お問い合わせ', 'Contacto', 'Contato', 'Contact'],
  'Button label': ['按钮文字', '按鈕文字', 'ボタンの文言', 'Texto del botón', 'Texto do botão', 'Texte du bouton'],
  'Button path': ['按钮路径', '按鈕路徑', 'ボタンのパス', 'Ruta del botón', 'Caminho do botão', 'Chemin du bouton'],
  Products: ['产品', '產品', '製品', 'Productos', 'Produtos', 'Produits'],
  Cards: ['卡片', '卡片', 'カード', 'Tarjetas', 'Cartões', 'Cartes'],
  'Product name': ['产品名称', '產品名稱', '製品名', 'Nombre del producto', 'Nome do produto', 'Nom du produit'],
  'Product role / status': [
    '产品定位／状态',
    '產品定位／狀態',
    '製品の役割／状態',
    'Función / estado del producto',
    'Função / status do produto',
    'Rôle / état du produit',
  ],
  'Product description': [
    '产品说明',
    '產品說明',
    '製品の説明',
    'Descripción del producto',
    'Descrição do produto',
    'Description du produit',
  ],
  'Product page path': [
    '产品页面路径',
    '產品頁面路徑',
    '製品ページのパス',
    'Ruta de la página del producto',
    'Caminho da página do produto',
    'Chemin de la page du produit',
  ],
  'Products / About — Learn more label': [
    '产品／关于 — 了解更多文字',
    '產品／關於 — 瞭解更多文字',
    '製品／会社紹介 — 詳細ボタンの文言',
    'Productos / Presentación — Texto de más información',
    'Produtos / Sobre — Texto de saiba mais',
    'Produits / Présentation — Texte du lien en savoir plus',
  ],
  'About — Learn more path': [
    '关于 — 了解更多路径',
    '關於 — 瞭解更多路徑',
    '会社紹介 — 詳細ページのパス',
    'Presentación — Ruta de más información',
    'Sobre — Caminho de saiba mais',
    'Présentation — Chemin du lien en savoir plus',
  ],
  'About / Secondary slide — Photo (original office photo when empty)': [
    '关于／第二张幻灯片 — 图片（留空使用原办公室图片）',
    '關於／第二張投影片 — 圖片（留空使用原辦公室圖片）',
    '会社紹介／2枚目のスライド — 写真（未設定時は元のオフィス写真）',
    'Presentación / Segunda diapositiva — Foto (vacío: foto original de la oficina)',
    'Sobre / Segundo slide — Foto (vazio: foto original do escritório)',
    'Présentation / Deuxième diapositive — Photo (vide : photo originale du bureau)',
  ],
  Method: ['方法', '方法', '手法', 'Método', 'Método', 'Méthode'],
  Steps: ['步骤', '步驟', 'ステップ', 'Pasos', 'Etapas', 'Étapes'],
  'Step heading': [
    '步骤标题',
    '步驟標題',
    'ステップの見出し',
    'Título del paso',
    'Título da etapa',
    'Titre de l’étape',
  ],
  'Step explanation': [
    '步骤说明',
    '步驟說明',
    'ステップの説明',
    'Explicación del paso',
    'Explicação da etapa',
    'Explication de l’étape',
  ],
  'Next step': ['下一步', '下一步', '次のステップ', 'Siguiente paso', 'Próxima etapa', 'Prochaine étape'],
  Title: ['标题', '標題', 'タイトル', 'Título', 'Título', 'Titre'],
  Description: ['说明', '說明', '説明', 'Descripción', 'Descrição', 'Description'],
  Text: ['正文', '內文', '本文', 'Texto', 'Texto', 'Texte'],
  Services: ['服务', '服務', 'サービス', 'Servicios', 'Serviços', 'Services'],
  Mission: ['使命', '使命', 'ミッション', 'Misión', 'Missão', 'Mission'],
  Principles: ['原则', '原則', '理念', 'Principios', 'Princípios', 'Principes'],
  'Primary action': [
    '主要按钮文字',
    '主要按鈕文字',
    '主ボタンの文言',
    'Texto de la acción principal',
    'Texto da ação principal',
    'Texte de l’action principale',
  ],
  'Secondary action': [
    '次要按钮文字',
    '次要按鈕文字',
    '副ボタンの文言',
    'Texto de la acción secundaria',
    'Texto da ação secundária',
    'Texte de l’action secondaire',
  ],
  Section: ['内容区块', '內容區塊', 'セクション', 'Sección', 'Seção', 'Section'],
  Process: ['流程', '流程', 'プロセス', 'Proceso', 'Processo', 'Processus'],
  Email: ['邮箱', '信箱', 'メール', 'Correo electrónico', 'E-mail', 'E-mail'],
  Context: [
    '需求背景',
    '需求背景',
    '依頼の背景',
    'Contexto de la solicitud',
    'Contexto da solicitação',
    'Contexte de la demande',
  ],
  Items: ['项目', '項目', '項目', 'Elementos', 'Itens', 'Éléments'],
  'Direct contact': [
    '直接联系',
    '直接聯絡',
    '直接のお問い合わせ',
    'Contacto directo',
    'Contato direto',
    'Contact direct',
  ],
  Privacy: [
    '隐私政策',
    '隱私政策',
    'プライバシーポリシー',
    'Política de privacidad',
    'Política de privacidade',
    'Politique de confidentialité',
  ],
  Terms: ['服务条款', '服務條款', '利用規約', 'Términos del servicio', 'Termos do serviço', 'Conditions d’utilisation'],
  'Items (one item per line)': [
    '项目（每行一项）',
    '項目（每行一項）',
    '項目（1行に1項目）',
    'Elementos (uno por línea)',
    'Itens (um por linha)',
    'Éléments (un par ligne)',
  ],
  Factors: ['报价因素', '報價因素', '料金の要因', 'Factores del precio', 'Fatores de preço', 'Facteurs tarifaires'],
  Stack: ['产品体系', '產品體系', '製品構成', 'Conjunto de productos', 'Conjunto de produtos', 'Ensemble de produits'],
  Capabilities: ['能力', '能力', '機能', 'Capacidades', 'Recursos', 'Fonctionnalités'],
  Workflow: ['工作流', '工作流程', 'ワークフロー', 'Flujo de trabajo', 'Fluxo de trabalho', 'Flux de travail'],
  'Page text / named locations': [
    '页面文字／对应位置',
    '頁面文字／對應位置',
    'ページ文言／配置場所',
    'Textos de la página / ubicaciones',
    'Textos da página / locais',
    'Textes de la page / emplacements',
  ],
  'Binding key (keep unchanged)': [
    '绑定标识（请勿更改）',
    '綁定識別碼（請勿更改）',
    '紐付けキー（変更しないでください）',
    'Clave de vinculación (no modificar)',
    'Chave de vínculo (não alterar)',
    'Clé de liaison (ne pas modifier)',
  ],
  'Text location': [
    '文字位置',
    '文字位置',
    '文言の配置場所',
    'Ubicación del texto',
    'Local do texto',
    'Emplacement du texte',
  ],
  'Text (plain text only)': [
    '文字（仅限纯文本）',
    '文字（僅限純文字）',
    '文言（プレーンテキストのみ）',
    'Texto (solo texto sin formato)',
    'Texto (somente texto simples)',
    'Texte (texte brut uniquement)',
  ],
  [INNER_DESCRIPTION]: [
    '现有多语言公开文案。证据、披露、表单提交和示例说明仍由代码控制。',
    '現有多語言公開文案。證據、揭露、表單提交及示例說明仍由程式碼控制。',
    '既存の多言語公開文言です。根拠、開示、フォーム送信、例示の注記は引き続きコードで管理します。',
    'Textos públicos existentes en varios idiomas. Las pruebas, divulgaciones, envíos de formularios y avisos ilustrativos siguen controlados por el código.',
    'Textos públicos existentes em vários idiomas. Evidências, divulgações, envios de formulário e avisos ilustrativos continuam controlados pelo código.',
    'Textes publics existants en plusieurs langues. Les preuves, mentions, envois de formulaires et avertissements illustratifs restent gérés par le code.',
  ],
  [KNOWN_COLLECTIONS.site_profile.description]: [
    '公开联系信息、页脚及品牌展示。全局站点信息、社交链接及 SEO 在设置中管理；导航在菜单中管理。',
    '公開聯絡資訊、頁尾及品牌呈現。全域網站資訊、社群連結及 SEO 在設定中管理；導覽在選單中管理。',
    '公開連絡先、フッター、ブランド表示です。サイト全体の情報・SNS・SEOは設定、ナビゲーションはメニューで管理します。',
    'Contacto público, pie de página y presentación de marca. La identidad global, las redes sociales y SEO se gestionan en Ajustes; la navegación, en Menús.',
    'Contato público, rodapé e apresentação da marca. Identidade global, redes sociais e SEO são gerenciados em Configurações; navegação, em Menus.',
    'Contact public, pied de page et présentation de la marque. Les informations globales, réseaux sociaux et SEO se gèrent dans les paramètres ; la navigation dans les menus.',
  ],
  [KNOWN_COLLECTIONS.site_pages.description]: [
    '首页展示内容，各语言独立编辑和发布。与文章及其编辑审核规则分开管理。',
    '首頁呈現內容，各語言獨立編輯和發布。與文章及其編輯審核規則分開管理。',
    'ホームページの表示内容です。各言語を個別に編集・公開します。記事とその編集審査ルールとは別に管理します。',
    'Contenido de la página de inicio. Cada idioma se edita y publica por separado, independientemente de los artículos y su política editorial.',
    'Conteúdo da página inicial. Cada idioma é editado e publicado separadamente dos artigos e da política editorial.',
    'Contenu de la page d’accueil. Chaque langue se modifie et se publie séparément des articles et de leur politique éditoriale.',
  ],
  [KNOWN_COLLECTIONS.page_english.description]: [
    '编辑对应位置的纯文本后发布。签名预览在现有英文地址显示草稿。SEO 面板管理页面元数据；地址、证据和披露逻辑保持固定。',
    '編輯對應位置的純文字後發布。簽章預覽在現有英文網址顯示草稿。SEO 面板管理頁面中繼資料；網址、證據和揭露邏輯保持固定。',
    '各配置場所のプレーンテキストを編集して公開します。署名付きプレビューは既存の英語URLで下書きを表示します。SEOパネルはメタデータを管理し、URL・根拠・開示の処理は固定です。',
    'Edite los textos de cada ubicación y publique. La vista previa firmada muestra borradores en la URL inglesa existente. SEO controla los metadatos; las URL y la lógica de pruebas y divulgación permanecen fijas.',
    'Edite os textos de cada local e publique. A prévia assinada mostra rascunhos na URL inglesa existente. SEO controla os metadados; URLs e a lógica de evidências e divulgação permanecem fixas.',
    'Modifiez les textes de chaque emplacement, puis publiez. L’aperçu signé affiche les brouillons à l’URL anglaise existante. SEO contrôle les métadonnées ; les URL et la logique des preuves et mentions restent fixes.',
  ],
};

const ALIASES: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  eyebrow: 'Eyebrow',
  lead: 'Introduction',
  services: 'Services',
  contact: 'Contact',
  principles: 'Principles',
  label: 'Label',
  text: 'Text',
  primary: 'Primary action',
  secondary: 'Secondary action',
  cards: 'Cards',
  steps: 'Steps',
  email: 'Email',
  items: 'Items',
  '0': 'Label',
  '1': 'Description',
  privacy: 'Privacy',
  terms: 'Terms',
  'items (one item per line)': 'Items (one item per line)',
  factors: 'Factors',
  stack: 'Stack',
  capabilities: 'Capabilities',
  'SEO / Page title': 'SEO — Page title',
  'metadata Title': 'SEO — Page title',
};
const SECTION_ALIASES: Record<string, string> = {
  hero: 'Hero',
  mission: 'Mission',
  products: 'Products',
  next: 'Next step',
  section: 'Section',
  process: 'Process',
  context: 'Context',
  direct: 'Direct contact',
  factors: 'Factors',
  capabilities: 'Capabilities',
  workflow: 'Workflow',
};
const PART_ALIASES: Record<string, string> = {
  Title: 'Heading',
  Lead: 'Introduction',
  Text: 'Text',
  Eyebrow: 'Eyebrow',
};
const PRODUCTS: Record<string, string> = {
  cinaseek: 'CinaSeek',
  cinaclaw: 'CinaClaw',
  cinatoken: 'CinaToken',
  cinaskill: 'CinaSkill',
  cinachain: 'CinaChain',
};

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function translate(source: string, localeIndex: number): string {
  const key = ALIASES[source] ?? source;
  if (TEXT[key]) return TEXT[key][localeIndex];
  const compound = source.split(' — ');
  if (compound.length === 2 && TEXT[compound[0]] && TEXT[compound[1]])
    return `${TEXT[compound[0]][localeIndex]} — ${TEXT[compound[1]][localeIndex]}`;
  const match = /^(\w+) (Eyebrow|Title|Lead|Text)$/.exec(source);
  if (match && SECTION_ALIASES[match[1]] && PART_ALIASES[match[2]])
    return `${TEXT[SECTION_ALIASES[match[1]]][localeIndex]} — ${TEXT[PART_ALIASES[match[2]]][localeIndex]}`;
  const product = /^product Descriptions \/ (\w+)$/.exec(source);
  if (product && PRODUCTS[product[1]]) return `${TEXT['Product description'][localeIndex]} — ${PRODUCTS[product[1]]}`;
  return source;
}

function translateProperty(value: JsonRecord, key: string, original: string, localeIndex: number): boolean {
  if (value[key] !== original) return false;
  const translated = translate(original, localeIndex);
  if (translated === original) return false;
  value[key] = translated;
  return true;
}

/** Only called for an already authenticated native manifest response. */
export function localizeAdminPresentationManifest(value: unknown, locale: string): boolean {
  // Both native Spanish variants use the same reviewed project terminology.
  const localeIndex = LOCALES.indexOf((locale === 'es-419' ? 'es-ES' : locale) as (typeof LOCALES)[number]);
  if (localeIndex < 0 || !record(value) || value.success !== true || !record(value.data)) return false;
  const collections = value.data.collections;
  if (!record(collections)) return false;
  let changed = false;
  for (const [slug, known] of Object.entries(KNOWN_COLLECTIONS)) {
    const collection = collections[slug];
    if (!record(collection)) continue;
    for (const key of ['label', 'labelSingular', 'description'] as const)
      changed = translateProperty(collection, key, known[key], localeIndex) || changed;
    changed = translateProperty(collection, 'group', 'Website', localeIndex) || changed;
    if (!record(collection.fields)) continue;
    for (const [fieldSlug, original] of Object.entries(known.fields)) {
      const field = collection.fields[fieldSlug];
      if (!record(field)) continue;
      changed = translateProperty(field, 'label', original, localeIndex) || changed;
      const subFields = known.subFields?.[fieldSlug];
      if (!subFields || !record(field.validation) || !Array.isArray(field.validation.subFields)) continue;
      for (const subField of field.validation.subFields) {
        if (!record(subField) || typeof subField.slug !== 'string') continue;
        const originalSubLabel = subFields[subField.slug];
        if (originalSubLabel) changed = translateProperty(subField, 'label', originalSubLabel, localeIndex) || changed;
      }
    }
  }
  return changed;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_MANIFEST_BYTES) {
        // Awaiting tee cancellation can wait for the untouched original body.
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/**
 * Apply after the existing Access/authentication guard and native Astro handler.
 * Schema/export and every content write keep their original stored metadata.
 */
export async function localizeAdminPresentationResponse(request: Request, response: Response): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !/^\/_emdash\/api\/manifest\/?$/.test(new URL(request.url).pathname) ||
    response.status !== 200 ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
    response.headers.has('content-encoding')
  )
    return response;

  const locale = resolveLocale(request);
  if (!LOCALES.some((code) => code === locale) && locale !== 'es-419') return response;
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MANIFEST_BYTES) return response;
  try {
    const value = await readBoundedJson(response.clone());
    if (!localizeAdminPresentationManifest(value, locale)) return response;
    const headers = new Headers(response.headers);
    for (const header of ['Content-Length', 'ETag', 'Last-Modified']) headers.delete(header);
    headers.set('Cache-Control', 'private, no-store');
    const vary = (headers.get('Vary') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!vary.includes('*')) {
      for (const header of ['Cookie', 'Accept-Language'])
        if (!vary.some((part) => part.toLowerCase() === header.toLowerCase())) vary.push(header);
      headers.set('Vary', vary.join(', '));
    }
    return new Response(JSON.stringify(value), { status: response.status, statusText: response.statusText, headers });
  } catch {
    // A malformed or unexpectedly shaped native response stays readable.
    return response;
  }
}
