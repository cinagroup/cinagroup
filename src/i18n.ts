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
    'hero.subtitle':
      'We provide cutting-edge solutions in AI search, intelligent robots, skill platforms, and blockchain infrastructure. Empowering businesses and developers worldwide.',
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
    'testimonials.quote1':
      'CinaSeek has transformed how our team accesses information. The AI-powered search is incredibly accurate and saves us hours every day.',
    'testimonials.author1': '—',
    'testimonials.role1': '[Company], [Title]',
    'testimonials.quote2':
      'CinaClaw automated our customer service workflows. The integration was smooth and the results exceeded our expectations.',
    'testimonials.author2': '—',
    'testimonials.role2': '[Company], [Title]',
    'testimonials.quote3':
      'The CinaChain infrastructure is reliable and well-documented. A solid foundation for our Web3 applications.',
    'testimonials.author3': '—',
    'testimonials.role3': '[Company], [Title]',

    // CTA
    'cta.title': 'Ready to {0} Your Business?',
    'cta.transform': 'Transform',
    'cta.subtitle':
      'Join thousands of companies using CinaGroup solutions.{0}Start your journey today with our free tier.',
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
} as const;

type TranslationKey = keyof typeof ui.en;
const dictionaries: Partial<Record<Lang, typeof ui.en>> = ui;

export function useTranslations(lang: Lang) {
  const dictionary = dictionaries[lang] ?? ui.en;

  return function t(key: TranslationKey) {
    return dictionary[key] || ui.en[key];
  };
}

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) return lang as keyof typeof languages;
  return defaultLang;
}

export function changeLangPath(url: URL, newLang: keyof typeof languages) {
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
