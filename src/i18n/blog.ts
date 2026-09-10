import type { Lang } from './routing';
import type { FactCheckVerdict } from '~/data/fact-checks';

export interface BlogStrings {
  /** Blog index page title. */
  listTitle: string;
  /** Blog index meta description. */
  listDescription: string;
  /** Blog index headline eyebrow. */
  listEyebrow: string;
  /** Blog index headline lead; receives the total post count. */
  listSubtitle: (total: number) => string;
  /** Title suffix for paginated index pages; receives the page number. */
  pageSuffix: (page: number) => string;
  backToBlog: string;
  newerPosts: string;
  olderPosts: string;
  updated: string;
  minRead: (minutes: number) => string;
  /** Post header eyebrow prefix before the category name. */
  journal: string;
  /** Post header eyebrow fallback when a post has no category. */
  journalFallback: string;
  archiveNoticeTitle: string;
  archiveNoticeBody: string;
  /** Fact-check panel labels. */
  factCheckTitle: string;
  factCheckCheckedBy: string;
  factCheckCheckedAt: string;
  factCheckSummary: string;
  factCheckSources: string;
  factCheckSource: (index: number) => string;
  factCheckVerdicts: Record<FactCheckVerdict, string>;
}

const blogStrings: Record<Lang, BlogStrings> = {
  en: {
    listTitle: 'AI news briefings',
    listDescription:
      'English AI news briefings preserved from CinaGroup’s retired automated workflow, with clear unverified archive labels.',
    listEyebrow: 'AI news / automated archive.',
    listSubtitle: (total) =>
      `${total} English briefings from our retired automated news workflow. These items are preserved for reference, were not independently source-checked, and should be verified against current primary sources.`,
    pageSuffix: (page) => ` — Page ${page}`,
    backToBlog: 'Back to blog',
    newerPosts: 'Newer posts',
    olderPosts: 'Older posts',
    updated: 'Updated',
    minRead: (minutes) => `${minutes} min read`,
    journal: 'Journal',
    journalFallback: 'Update',
    archiveNoticeTitle: 'Automated briefing · unverified archive',
    archiveNoticeBody:
      'This item came from a retired automated workflow and was not independently source-checked by the CinaGroup editorial team. It may contain inaccurate or outdated claims. Confirm every claim with current primary sources.',

    factCheckTitle: 'Fact check',
    factCheckCheckedBy: 'Checked by',
    factCheckCheckedAt: 'Checked on',
    factCheckSummary: 'Review summary',
    factCheckSources: 'Sources',
    factCheckSource: (index) => `Source ${index}`,
    factCheckVerdicts: {
      supported: 'Supported',
      partially_supported: 'Partially supported',
      unsupported: 'Unsupported',
      unresolvable: 'Unresolved',
    },
  },
  zh: {
    listTitle: 'AI 资讯与博客',
    listDescription: '海内集团以中文发布的博客文章与 AI 资讯。',
    listEyebrow: 'AI 资讯 / 博客。',
    listSubtitle: (total) => `共 ${total} 篇中文文章。`,
    pageSuffix: (page) => ` — 第 ${page} 页`,
    backToBlog: '返回博客',
    newerPosts: '较新文章',
    olderPosts: '较早文章',
    updated: '更新于',
    minRead: (minutes) => `${minutes} 分钟阅读`,
    journal: '博客',
    journalFallback: '动态',
    archiveNoticeTitle: '自动资讯简报 · 未核验历史归档',
    archiveNoticeBody:
      '本条目来自已停用的自动化流程，未经海内集团编辑团队独立核验，可能包含不准确或过时的内容。请以当前一手来源逐项确认。',

    factCheckTitle: '事实核验',
    factCheckCheckedBy: '核验方',
    factCheckCheckedAt: '核验日期',
    factCheckSummary: '核验摘要',
    factCheckSources: '公开来源',
    factCheckSource: (index) => `来源 ${index}`,
    factCheckVerdicts: {
      supported: '有依据',
      partially_supported: '部分有依据',
      unsupported: '无依据',
      unresolvable: '无法核实',
    },
  },
  ja: {
    listTitle: 'AIニュースとブログ',
    listDescription: 'CinaGroup が日本語で公開するブログ記事と AI ニュース。',
    listEyebrow: 'AIニュース / ブログ。',
    listSubtitle: (total) => `全 ${total} 件の日本語記事。`,
    pageSuffix: (page) => ` — 第${page}ページ`,
    backToBlog: 'ブログに戻る',
    newerPosts: '新しい記事',
    olderPosts: '過去の記事',
    updated: '更新',
    minRead: (minutes) => `${minutes} 分で読めます`,
    journal: 'ジャーナル',
    journalFallback: 'アップデート',
    archiveNoticeTitle: '自動ニュース · 未検証アーカイブ',
    archiveNoticeBody:
      'この記事は廃止済みの自動処理で生成され、CinaGroup 編集部による独立した情報源の確認を受けていません。不正確または古い内容を含む可能性があるため、最新の一次情報で各主張を確認してください。',

    factCheckTitle: 'ファクトチェック',
    factCheckCheckedBy: '確認者',
    factCheckCheckedAt: '確認日',
    factCheckSummary: '検証概要',
    factCheckSources: '公開情報源',
    factCheckSource: (index) => `情報源 ${index}`,
    factCheckVerdicts: {
      supported: '裏付けあり',
      partially_supported: '一部裏付けあり',
      unsupported: '裏付けなし',
      unresolvable: '確認不能',
    },
  },
  ko: {
    listTitle: 'AI 뉴스와 블로그',
    listDescription: 'CinaGroup이 한국어로 게시하는 블로그 글과 AI 뉴스.',
    listEyebrow: 'AI 뉴스 / 블로그.',
    listSubtitle: (total) => `총 ${total}개의 한국어 글.`,
    pageSuffix: (page) => ` — ${page}페이지`,
    backToBlog: '블로그로 돌아가기',
    newerPosts: '최신 글',
    olderPosts: '이전 글',
    updated: '업데이트',
    minRead: (minutes) => `${minutes}분 읽기`,
    journal: '저널',
    journalFallback: '업데이트',
    archiveNoticeTitle: '자동 브리핑 · 미검증 아카이브',
    archiveNoticeBody:
      '이 항목은 종료된 자동화 워크플로에서 생성되었으며 CinaGroup 편집팀의 독립적인 출처 검증을 거치지 않았습니다. 부정확하거나 오래된 주장이 포함될 수 있으니 최신 1차 출처로 확인하세요.',

    factCheckTitle: '팩트 체크',
    factCheckCheckedBy: '검증 주체',
    factCheckCheckedAt: '검증일',
    factCheckSummary: '검증 요약',
    factCheckSources: '출처',
    factCheckSource: (index) => `출처 ${index}`,
    factCheckVerdicts: {
      supported: '근거 있음',
      partially_supported: '일부 근거 있음',
      unsupported: '근거 없음',
      unresolvable: '확인 불가',
    },
  },
  ru: {
    listTitle: 'AI-новости и блог',
    listDescription: 'Блог-статьи и новости ИИ CinaGroup на русском языке.',
    listEyebrow: 'AI-новости / блог.',
    listSubtitle: (total) => `Всего записей на русском: ${total}.`,
    pageSuffix: (page) => ` — Страница ${page}`,
    backToBlog: 'Назад к блогу',
    newerPosts: 'Новые записи',
    olderPosts: 'Предыдущие записи',
    updated: 'Обновлено',
    minRead: (minutes) => `${minutes} мин чтения`,
    journal: 'Журнал',
    journalFallback: 'Обновление',
    archiveNoticeTitle: 'Автоматическая сводка · непроверенный архив',
    archiveNoticeBody:
      'Материал создан выведенным из эксплуатации автоматизированным процессом и не проходил независимую проверку редакцией CinaGroup. Он может содержать неточные или устаревшие утверждения; сверяйте их с актуальными первичными источниками.',

    factCheckTitle: 'Проверка фактов',
    factCheckCheckedBy: 'Проверил(и)',
    factCheckCheckedAt: 'Дата проверки',
    factCheckSummary: 'Итоги проверки',
    factCheckSources: 'Источники',
    factCheckSource: (index) => `Источник ${index}`,
    factCheckVerdicts: {
      supported: 'Подтверждено',
      partially_supported: 'Частично подтверждено',
      unsupported: 'Не подтверждено',
      unresolvable: 'Не удалось проверить',
    },
  },
  es: {
    listTitle: 'Noticias de IA y blog',
    listDescription: 'Artículos del blog y noticias de IA de CinaGroup en español.',
    listEyebrow: 'Noticias de IA / blog.',
    listSubtitle: (total) => `${total} artículos en español.`,
    pageSuffix: (page) => ` — Página ${page}`,
    backToBlog: 'Volver al blog',
    newerPosts: 'Entradas más recientes',
    olderPosts: 'Entradas anteriores',
    updated: 'Actualizado',
    minRead: (minutes) => `${minutes} min de lectura`,
    journal: 'Blog',
    journalFallback: 'Novedad',
    archiveNoticeTitle: 'Resumen automático · archivo no verificado',
    archiveNoticeBody:
      'Este contenido procede de un flujo automatizado retirado y no fue verificado de forma independiente por el equipo editorial de CinaGroup. Puede contener afirmaciones inexactas o desactualizadas; contrástelas con fuentes primarias actuales.',

    factCheckTitle: 'Verificación de hechos',
    factCheckCheckedBy: 'Verificado por',
    factCheckCheckedAt: 'Fecha de verificación',
    factCheckSummary: 'Resumen de la verificación',
    factCheckSources: 'Fuentes',
    factCheckSource: (index) => `Fuente ${index}`,
    factCheckVerdicts: {
      supported: 'Confirmado',
      partially_supported: 'Parcialmente confirmado',
      unsupported: 'Sin fundamento',
      unresolvable: 'No verificable',
    },
  },
  pt: {
    listTitle: 'Notícias de IA e blog',
    listDescription: 'Artigos do blog e notícias de IA da CinaGroup em português.',
    listEyebrow: 'Notícias de IA / blog.',
    listSubtitle: (total) => `${total} artigos em português.`,
    pageSuffix: (page) => ` — Página ${page}`,
    backToBlog: 'Voltar ao blog',
    newerPosts: 'Postagens mais recentes',
    olderPosts: 'Postagens anteriores',
    updated: 'Atualizado',
    minRead: (minutes) => `${minutes} min de leitura`,
    journal: 'Blog',
    journalFallback: 'Novidade',
    archiveNoticeTitle: 'Resumo automático · arquivo não verificado',
    archiveNoticeBody:
      'Este conteúdo veio de um fluxo automatizado desativado e não passou por verificação independente da equipe editorial da CinaGroup. Pode conter afirmações incorretas ou desatualizadas; confirme-as em fontes primárias atuais.',

    factCheckTitle: 'Verificação de fatos',
    factCheckCheckedBy: 'Verificado por',
    factCheckCheckedAt: 'Data da verificação',
    factCheckSummary: 'Resumo da verificação',
    factCheckSources: 'Fontes',
    factCheckSource: (index) => `Fonte ${index}`,
    factCheckVerdicts: {
      supported: 'Confirmado',
      partially_supported: 'Parcialmente confirmado',
      unsupported: 'Sem fundamento',
      unresolvable: 'Não verificável',
    },
  },
  fr: {
    listTitle: 'Actualité IA et blog',
    listDescription: 'Articles de blog et actualité IA de CinaGroup en français.',
    listEyebrow: 'Actualité IA / blog.',
    listSubtitle: (total) => `${total} articles en français.`,
    pageSuffix: (page) => ` — Page ${page}`,
    backToBlog: 'Retour au blog',
    newerPosts: 'Articles plus récents',
    olderPosts: 'Articles précédents',
    updated: 'Mis à jour',
    minRead: (minutes) => `${minutes} min de lecture`,
    journal: 'Journal',
    journalFallback: 'Actualité',
    archiveNoticeTitle: 'Synthèse automatisée · archive non vérifiée',
    archiveNoticeBody:
      "Cet article provient d'un processus automatisé désormais retiré et n'a pas fait l'objet d'une vérification indépendante par la rédaction de CinaGroup. Il peut contenir des affirmations inexactes ou obsolètes ; vérifiez-les dans des sources primaires actuelles.",

    factCheckTitle: 'Vérification des faits',
    factCheckCheckedBy: 'Vérifié par',
    factCheckCheckedAt: 'Date de vérification',
    factCheckSummary: 'Synthèse de la vérification',
    factCheckSources: 'Sources',
    factCheckSource: (index) => `Source ${index}`,
    factCheckVerdicts: {
      supported: 'Confirmé',
      partially_supported: 'Partiellement confirmé',
      unsupported: 'Non fondé',
      unresolvable: 'Invérifiable',
    },
  },
};

/** Blog UI strings for a locale; unknown locales fall back to English. */
export const getBlogStrings = (lang?: Lang): BlogStrings => blogStrings[lang ?? 'en'] ?? blogStrings.en;
