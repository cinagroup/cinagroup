import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: '产品',
      links: [
        { text: 'CinaSeek — 智能搜索', href: getPermalink('/cinaseek') },
        { text: 'CinaClaw — AI 助手', href: getPermalink('/cinaclaw') },
        { text: 'CinaToken — AI API 网关', href: getPermalink('/cinatoken') },
        { text: 'CinaSkill — 技能平台', href: getPermalink('/cinaskill') },
        { text: 'CinaChain — 区块链网络', href: getPermalink('/cinachain') },
      ],
    },
    {
      text: '解决方案',
      links: [
        { text: '企业版', href: getPermalink('/#business') },
        { text: '开发者', href: getPermalink('/cinaskill') },
        { text: '初创公司', href: getPermalink('/contact') },
      ],
    },
    {
      text: '资源',
      links: [
        { text: '博客', href: getBlogPermalink() },
        { text: '文档', href: '#' },
        { text: 'API 参考', href: '#' },
      ],
    },
    {
      text: '公司',
      links: [
        { text: '关于我们', href: getPermalink('/about') },
        { text: '联系我们', href: getPermalink('/contact') },
        { text: '加入我们', href: '#' },
      ],
    },
  ],
  actions: [
    { text: '登录', href: 'https://cinaseek.ai/login', variant: 'primary', target: '_blank' },
    { text: '注册', href: 'https://cinaseek.ai/register', variant: 'secondary', target: '_blank' },
  ],
};

export const footerData = {
  links: [
    {
      title: '产品',
      links: [
        { text: 'CinaSeek — 智能搜索', href: '/cinaseek' },
        { text: 'CinaClaw — AI 助手', href: '/cinaclaw' },
        { text: 'CinaToken — AI API 网关', href: '/cinatoken' },
        { text: 'CinaSkill — 技能平台', href: '/cinaskill' },
        { text: 'CinaChain — 区块链网络', href: '/cinachain' },
      ],
    },
    {
      title: '开发者',
      links: [
        { text: '文档', href: '#' },
        { text: 'API 参考', href: '#' },
        { text: 'SDK 和工具', href: '#' },
        { text: '资助计划', href: '#' },
        { text: '开发者博客', href: '/blog' },
      ],
    },
    {
      title: '支持',
      links: [
        { text: '帮助中心', href: '#' },
        { text: '社区', href: '#' },
        { text: '联系支持', href: '/contact' },
        { text: '系统状态', href: '#' },
      ],
    },
    {
      title: '公司',
      links: [
        { text: '关于我们', href: '/about' },
        { text: '博客', href: '/blog' },
        { text: '加入我们', href: '#' },
        { text: '媒体资料', href: '#' },
        { text: '联系我们', href: '/contact' },
      ],
    },
  ],
  secondaryLinks: [
    { text: '服务条款', href: getPermalink('/terms') },
    { text: '隐私政策', href: getPermalink('/privacy') },
    { text: 'Cookie 政策', href: '#' },
  ],
  socialLinks: [
    { ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: 'https://github.com/cinagroup' },
    { ariaLabel: 'X', icon: 'tabler:brand-x', href: 'https://x.com/cinagroup' },
    { ariaLabel: 'TikTok', icon: 'tabler:brand-tiktok', href: 'https://tiktok.com/@cinaseek' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/cinaseek/' },
    { ariaLabel: 'RSS', icon: 'tabler:rss', href: getAsset('/rss.xml') },
  ],
  footNote: `
    &copy; 2026 By CinaClaw@CinaSeek.AI 版权所有。
  `,
};
