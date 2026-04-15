export const languages = {
  en: 'English',
  zh: '简体中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
} as const;

export const defaultLang: keyof typeof languages = 'en';

export type Lang = keyof typeof languages;

export const supportedLocales: Lang[] = ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'];

export type Lang = keyof typeof languages;

export const ui = {
  en: {
    // Navigation
    'nav.products': 'Products',
    'nav.solutions': 'Solutions',
    'nav.resources': 'Resources',
    'nav.company': 'Company',
    'nav.blog': 'Blog',
    'nav.documentation': 'Documentation',
    'nav.apiReference': 'API Reference',
    
    // Hero Section
    'hero.welcome': 'Welcome to CinaGroup',
    'hero.title': 'Building the Future of {0} & {1}',
    'hero.ai': 'AI',
    'hero.web3': 'Web3',
    'hero.subtitle': 'We provide cutting-edge solutions in AI search, intelligent robots, skill platforms, and blockchain infrastructure. Empowering businesses and developers worldwide.',
    'hero.exploreProducts': 'Explore Products',
    'hero.contactUs': 'Contact Us',
    
    // Business Lines
    'business.title': 'Our Business Lines',
    'business.subtitle': 'Five powerful platforms working together to deliver comprehensive AI and Web3 solutions',
    'business.cinaseek.title': 'CinaSeek',
    'business.cinaseek.tagline': 'Intelligent Search',
    'business.cinaseek.desc': 'AI-driven enterprise search solution with multi-source data aggregation',
    'business.cinaseek.action': 'Learn More',
    'business.cinaclaw.title': 'CinaClaw',
    'business.cinaclaw.tagline': 'AI Assistant',
    'business.cinaclaw.desc': '24/7 AI assistant with multi-platform integration and workflow automation',
    'business.cinaclaw.action': 'Try Demo',
    'business.cinaskill.title': 'CinaSkill',
    'business.cinaskill.tagline': 'Skills Platform',
    'business.cinaskill.desc': 'Create, share, and discover robot skills with unlimited possibilities',
    'business.cinaskill.action': 'Browse Skills',
    'business.cinachain.title': 'CinaChain',
    'business.cinachain.tagline': 'Blockchain Network',
    'business.cinachain.desc': 'High-performance, low-cost Web3 infrastructure with smart contracts and DeFi',
    'business.cinachain.action': 'View Network',
    'business.cinatoken.title': 'CinaToken',
    'business.cinatoken.tagline': 'AI API Gateway',
    'business.cinatoken.desc': 'Unified API gateway for Claude, GPT, Gemini, and 100+ AI models',
    'business.cinatoken.action': 'Get API Key',
    
    // Why Choose Us
    'why.title': 'Why Choose Us',
    'why.subtitle': 'Technology That Drives Innovation',
    'why.description': 'Built on cutting-edge technology with a focus on performance, security, and scalability',
    'why.ai.title': 'AI-Powered Intelligence',
    'why.ai.desc': 'Advanced machine learning models power our search, robotics, and automation solutions.',
    'why.security.title': 'Blockchain Security',
    'why.security.desc': 'Enterprise-grade security with decentralized architecture and cryptographic protection.',
    'why.developer.title': 'Developer First',
    'why.developer.desc': 'Comprehensive APIs, SDKs, and documentation to accelerate your development.',
    'why.infrastructure.title': 'Scalable Infrastructure',
    'why.infrastructure.desc': 'Cloud-native architecture that scales seamlessly with your growing needs.',
    'why.realtime.title': 'Real-time Processing',
    'why.realtime.desc': 'Low-latency data processing and real-time analytics for time-critical applications.',
    'why.support.title': '24/7 Support',
    'why.support.desc': 'Round-the-clock technical support and comprehensive knowledge base.',
    
    // Stats (placeholder values — update with real metrics)
    'stats.users': 'Active Users',
    'stats.apiCalls': 'API Calls/Day',
    'stats.skills': 'Skills Available',
    'stats.nodes': 'Network Nodes',
    
    // How It Works
    'how.title': 'How It Works',
    'how.subtitle': 'Get started in three simple steps',
    'how.step1.title': 'Choose Your Product',
    'how.step1.desc': 'Select from our four business lines based on your needs',
    'how.step2.title': 'Integrate & Deploy',
    'how.step2.desc': 'Use our APIs and SDKs to integrate with your existing systems',
    'how.step3.title': 'Scale & Optimize',
    'how.step3.desc': 'Monitor performance and scale as your usage grows',
    
    // Testimonials (placeholder — replace with real customer quotes)
    'testimonials.title': 'What Our Clients Say',
    'testimonials.quote1': 'CinaSeek has transformed how our team accesses information. The AI-powered search is incredibly accurate and saves us hours every day.',
    'testimonials.author1': '—',
    'testimonials.role1': '[Company], [Title]',
    'testimonials.quote2': 'CinaClaw automated our customer service workflows. The integration was smooth and the results exceeded our expectations.',
    'testimonials.author2': '—',
    'testimonials.role2': '[Company], [Title]',
    'testimonials.quote3': 'The CinaChain infrastructure is reliable and well-documented. A solid foundation for our Web3 applications.',
    'testimonials.author3': '—',
    'testimonials.role3': '[Company], [Title]',
    
    // CTA
    'cta.title': 'Ready to {0} Your Business?',
    'cta.transform': 'Transform',
    'cta.subtitle': 'Join thousands of companies using CinaGroup solutions.{0}Start your journey today with our free tier.',
    'cta.getStarted': 'Get Started Free',
    'cta.talkToSales': 'Talk to Sales',
    
    // Footer
    'footer.products': 'Products',
    'footer.developers': 'Developers',
    'footer.support': 'Support',
    'footer.company': 'Company',
    'footer.about': 'About Us',
    'footer.careers': 'Careers',
    'footer.press': 'Press Kit',
    'footer.contact': 'Contact',
    'footer.helpCenter': 'Help Center',
    'footer.community': 'Community',
    'footer.systemStatus': 'System Status',
    'footer.sdkTools': 'SDK & Tools',
    'footer.grants': 'Grants Program',
    'footer.developerBlog': 'Developer Blog',
    'footer.rights': '© 2026 By CinaClaw@CinaSeek.AI All Rights Reserved.',
  },
  zh: {
    // Navigation
    'nav.products': '产品',
    'nav.solutions': '解决方案',
    'nav.resources': '资源',
    'nav.company': '公司',
    'nav.blog': '博客',
    'nav.documentation': '文档',
    'nav.apiReference': 'API 参考',
    
    // Hero Section
    'hero.welcome': '欢迎来到 CinaGroup',
    'hero.title': '构建{0}与{1}的未来',
    'hero.ai': '人工智能',
    'hero.web3': 'Web3',
    'hero.subtitle': '我们提供尖端的人工智能搜索、智能机器人、技能平台和区块链基础设施解决方案，赋能全球企业和开发者。',
    'hero.exploreProducts': '探索产品',
    'hero.contactUs': '联系我们',
    
    // Business Lines
    'business.title': '我们的业务线',
    'business.subtitle': '五大平台协同工作，提供全面的 AI 和 Web3 解决方案',
    'business.cinaseek.title': 'CinaSeek',
    'business.cinaseek.tagline': '智能搜索',
    'business.cinaseek.desc': 'AI 驱动的企业级搜索解决方案，支持多源数据聚合',
    'business.cinaseek.action': '了解更多',
    'business.cinaclaw.title': 'CinaClaw',
    'business.cinaclaw.tagline': 'AI 助手',
    'business.cinaclaw.desc': '24/7 AI 助手，支持多平台集成和工作流自动化',
    'business.cinaclaw.action': '试用演示',
    'business.cinaskill.title': 'CinaSkill',
    'business.cinaskill.tagline': '技能平台',
    'business.cinaskill.desc': '创建、分享和发现机器人技能，无限可能',
    'business.cinaskill.action': '浏览技能',
    'business.cinachain.title': 'CinaChain',
    'business.cinachain.tagline': '区块链网络',
    'business.cinachain.desc': '高性能、低成本的 Web3 基础设施，支持智能合约和 DeFi',
    'business.cinachain.action': '查看网络',
    'business.cinatoken.title': 'CinaToken',
    'business.cinatoken.tagline': 'AI API 网关',
    'business.cinatoken.desc': '统一 API 网关，支持 Claude、GPT、Gemini 等 100+ AI 模型',
    'business.cinatoken.action': '获取 API 密钥',
    
    // Why Choose Us
    'why.title': '为什么选择我们',
    'why.subtitle': '驱动创新的技术',
    'why.description': '基于尖端技术构建，专注于性能、安全性和可扩展性',
    'why.ai.title': 'AI 驱动的智能',
    'why.ai.desc': '先进的机器学习模型为我们的搜索、机器人和自动化解决方案提供动力。',
    'why.security.title': '区块链安全',
    'why.security.desc': '企业级安全，采用去中心化架构和加密保护。',
    'why.developer.title': '开发者优先',
    'why.developer.desc': '全面的 API、SDK 和文档，加速您的开发。',
    'why.infrastructure.title': '可扩展的基础设施',
    'why.infrastructure.desc': '云原生架构，随您的需求无缝扩展。',
    'why.realtime.title': '实时处理',
    'why.realtime.desc': '低延迟数据处理和实时分析，适用于时间关键型应用。',
    'why.support.title': '24/7 支持',
    'why.support.desc': '全天候技术支持和全面的知识库。',
    
    // Stats（占位数值 — 请用真实数据替换）
    'stats.users': '活跃用户',
    'stats.apiCalls': 'API 调用/天',
    'stats.skills': '可用技能',
    'stats.nodes': '网络节点',
    
    // How It Works
    'how.title': '如何开始',
    'how.subtitle': '三个简单步骤即可开始',
    'how.step1.title': '选择您的产品',
    'how.step1.desc': '根据您的需求从四条业务线中选择',
    'how.step2.title': '集成与部署',
    'how.step2.desc': '使用我们的 API 和 SDK 与现有系统集成',
    'how.step3.title': '扩展与优化',
    'how.step3.desc': '监控性能并随使用量增长而扩展',
    
    // Testimonials（占位 — 替换为真实客户评价）
    'testimonials.title': '客户评价',
    'testimonials.quote1': 'CinaSeek 彻底改变了我们团队获取信息的方式。AI 驱动的搜索非常准确，每天为我们节省数小时。',
    'testimonials.author1': '—',
    'testimonials.role1': '[公司名]，[职位]',
    'testimonials.quote2': 'CinaClaw 自动化了我们的客户服务工作流。集成过程很顺畅，效果超出预期。',
    'testimonials.author2': '—',
    'testimonials.role2': '[公司名]，[职位]',
    'testimonials.quote3': 'CinaChain 基础设施稳定可靠，文档完善。是我们 Web3 应用的坚实基础。',
    'testimonials.author3': '—',
    'testimonials.role3': '[公司名]，[职位]',
    
    // CTA
    'cta.title': '准备好{0}您的业务了吗？',
    'cta.transform': '变革',
    'cta.subtitle': '加入数千使用 CinaGroup 解决方案的公司。{0}立即开始您的免费之旅。',
    'cta.getStarted': '免费开始',
    'cta.talkToSales': '联系销售',
    
    // Footer
    'footer.products': '产品',
    'footer.developers': '开发者',
    'footer.support': '支持',
    'footer.company': '公司',
    'footer.about': '关于我们',
    'footer.careers': '加入我们',
    'footer.press': '媒体资料',
    'footer.contact': '联系我们',
    'footer.helpCenter': '帮助中心',
    'footer.community': '社区',
    'footer.systemStatus': '系统状态',
    'footer.sdkTools': 'SDK 和工具',
    'footer.grants': '资助计划',
    'footer.developerBlog': '开发者博客',
    'footer.rights': '© 2026 By CinaClaw@CinaSeek.AI 版权所有。',
  },
} as const;

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof typeof ui[typeof lang]) {
    return ui[lang][key] || ui.en[key];
  };
}

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) return lang as keyof typeof languages;
  return defaultLang;
}

export function changeLangPath(url: URL, newLang: keyof typeof languages) {
  const parts = url.pathname.split('/');
  if (parts[1] in languages) {
    parts[1] = newLang;
  } else {
    parts.splice(1, 0, newLang);
  }
  return parts.join('/').replace(/\/+/g, '/');
}

export function getPath(path: string, lang: string = defaultLang) {
  if (lang === defaultLang) {
    return path;
  }
  return `/${lang}${path}`;
}
