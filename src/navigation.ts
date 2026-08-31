import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';
import type { CallToAction } from './types';

export const headerData = {
  links: [
    {
      text: 'Products',
      links: [
        {
          text: 'CinaSeek — Agent Workspace',
          href: getPermalink('/cinaseek'),
        },
        {
          text: 'CinaClaw — Local-first Agent Gateway',
          href: getPermalink('/cinaclaw'),
        },
        {
          text: 'CinaToken — Open-source Model Gateway',
          href: getPermalink('/cinatoken'),
        },
        {
          text: 'CinaSkill — CinaClaw SKILL.md Format',
          href: getPermalink('/cinaskill'),
        },
        {
          text: 'CinaChain — Base Sepolia NFT DApp Beta',
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
        {
          text: 'Evidence',
          href: getPermalink('/work'),
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
  ] satisfies CallToAction[],
};

export const footerData = {
  description: 'Auditable agent workspaces, gateways, reusable skills, and testnet applications.',
  links: [
    {
      title: 'Products',
      links: [
        { text: 'CinaSeek', href: '/cinaseek/' },
        { text: 'CinaClaw', href: '/cinaclaw/' },
        { text: 'CinaToken', href: '/cinatoken/' },
        { text: 'CinaSkill', href: '/cinaskill/' },
        { text: 'CinaChain', href: '/cinachain/' },
      ],
    },
    {
      title: 'Company',
      links: [
        { text: 'About Us', href: '/about' },
        { text: 'Evidence', href: '/work' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { text: 'Blog', href: '/blog' },
        { text: 'RSS', href: getAsset('/rss.xml') },
      ],
    },
    {
      title: 'Support',
      links: [{ text: 'Contact Support', href: '/contact' }],
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
