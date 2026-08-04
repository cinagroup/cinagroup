import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';
import type { CallToAction } from './types';

export const headerData = {
  links: [
    {
      text: 'Products',
      links: [
        {
          text: 'CinaSeek — Intelligent Search',
          href: getPermalink('/cinaseek'),
        },
        {
          text: 'CinaClaw — AI Assistant',
          href: getPermalink('/cinaclaw'),
        },
        {
          text: 'CinaToken — AI API Gateway',
          href: getPermalink('/cinatoken'),
        },
        {
          text: 'CinaSkill — Skills Platform',
          href: getPermalink('/cinaskill'),
        },
        {
          text: 'CinaChain — Blockchain Network',
          href: getPermalink('/cinachain'),
        },
      ],
    },
    {
      text: 'Solutions',
      links: [
        {
          text: 'Enterprise',
          href: getPermalink('/services'),
        },
        {
          text: 'Developers',
          href: getPermalink('/cinaskill'),
        },
        {
          text: 'Startups',
          href: getPermalink('/contact'),
        },
      ],
    },
    {
      text: 'Resources',
      links: [
        {
          text: 'Blog',
          href: getBlogPermalink(),
        },
      ],
    },
    {
      text: 'Company',
      links: [
        {
          text: 'About',
          href: getPermalink('/about'),
        },
        {
          text: 'Contact',
          href: getPermalink('/contact'),
        },
      ],
    },
  ],
  actions: [
    { text: 'Login', href: 'https://cinaseek.ai/login', variant: 'primary', target: '_blank' },
    { text: 'Signup', href: 'https://cinaseek.ai/register', variant: 'secondary', target: '_blank' },
  ] satisfies CallToAction[],
};

export const footerData = {
  links: [
    {
      title: 'Products',
      links: [
        { text: 'CinaSeek — Intelligent Search', href: '/cinaseek' },
        { text: 'CinaClaw — AI Assistant', href: '/cinaclaw' },
        { text: 'CinaToken — AI API Gateway', href: '/cinatoken' },
        { text: 'CinaSkill — Skills Platform', href: '/cinaskill' },
        { text: 'CinaChain — Blockchain Network', href: '/cinachain' },
      ],
    },
    {
      title: 'Developers',
      links: [{ text: 'Developer Blog', href: '/blog' }],
    },
    {
      title: 'Support',
      links: [{ text: 'Contact Support', href: '/contact' }],
    },
    {
      title: 'Company',
      links: [
        { text: 'About Us', href: '/about' },
        { text: 'Blog', href: '/blog' },
        { text: 'Contact', href: '/contact' },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Terms of Service', href: getPermalink('/terms') },
    { text: 'Privacy Policy', href: getPermalink('/privacy') },
  ],
  socialLinks: [
    { ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: 'https://github.com/cinagroup' },
    { ariaLabel: 'X', icon: 'tabler:brand-x', href: 'https://x.com/cinagroup' },
    { ariaLabel: 'TikTok', icon: 'tabler:brand-tiktok', href: 'https://tiktok.com/@cinaseek' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/cinaseek/' },
    { ariaLabel: 'RSS', icon: 'tabler:rss', href: getAsset('/rss.xml') },
  ],
  footNote: `
    &copy; 2026 CinaGroup. All rights reserved.
  `,
};
