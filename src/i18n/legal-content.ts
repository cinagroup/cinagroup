import type { Lang } from './routing';

export type LocalizedLang = Exclude<Lang, 'en'>;
export type LegalDocument = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalCopy {
  title: string;
  description: string;
  updated: string;
  noticeTitle: string;
  notice: string;
  englishLink: string;
  intro: string;
  sections: LegalSection[];
}

type LocaleLegalCopy = Record<LegalDocument, LegalCopy>;

export const localizedLegalCopy: Record<LocalizedLang, LocaleLegalCopy> = {
  zh: {
    privacy: {
      title: '隐私政策',
      description: '说明海内集团如何在公开网站与联系表单中处理信息。',
      updated: '最后更新：2026 年 8 月 31 日',
      noticeTitle: '重要翻译说明',
      notice:
        '本中文版本仅为方便阅读而提供，尚未完成由当地法律专业人士进行的法律审查。如中文版本与英文版本不一致，在适用法律允许的范围内，以英文版本为准。',
      englishLink: '阅读正式英文版本',
      intro: '本政策说明您访问 cinagroup.com 或使用本网站公布的联系方式时，海内集团如何处理信息。',
      sections: [
        {
          heading: '概要',
          paragraphs: ['您无需创建海内集团网站账户即可浏览公开页面。'],
          bullets: [
            '联系表单会将您填写的信息提交至海内集团端点，获接受的咨询将存储在 Cloudflare D1 中。',
            '托管与安全服务提供商可能处理交付和保护网站所需的标准技术请求信息。',
            '海内集团产品网站与第三方服务适用各自的隐私政策。',
          ],
        },
        {
          heading: '您选择提供的信息',
          paragraphs: [
            '提交联系表单时，我们会存储提交参考编号、提交时间、计划保留日期、表单语言、姓名、电子邮箱、您自愿提供的公司或团队、咨询类别与内容，以及运营状态、通知状态和接收咨询的网站主机名。',
            '联系数据库不会有意存储您的 IP 地址或浏览器用户代理；Cloudflare 可能会另行处理网络与安全所需的技术信息。若您直接发送邮件，我们会收到邮件内容及通常的邮件元数据。',
            '请勿通过联系表单或普通电子邮件发送密码、API 密钥、支付卡信息、政府身份标识、健康信息或其他敏感个人信息。',
          ],
        },
        {
          heading: '技术信息',
          paragraphs: [
            '网站通过互联网交付时，托管、网络与安全系统可能处理 IP 地址、请求时间、请求页面、浏览器或设备信息、来源页面与安全信号等信息。这些信息可用于交付网站、防止滥用、调查错误并维持服务可靠性。',
          ],
        },
        {
          heading: 'Cookie 与本地存储',
          paragraphs: [
            '浏览本网站公开页面不需要广告画像。服务提供商可能在安全、流量管理或核心功能所需时使用必要存储或类似技术。从本网站进入的产品网站可能依据其自身政策使用不同的 Cookie 或存储。',
          ],
        },
        {
          heading: '我们如何使用信息',
          paragraphs: ['我们仅将信息用于与本次互动合理相关的目的，包括：'],
          bullets: [
            '回复咨询与支持请求；',
            '评估并界定所请求工作的范围；',
            '运营、保护与改进网站；',
            '防止欺诈、滥用与未经授权的活动；',
            '履行适用的法律义务；以及',
            '确立、行使或维护法律权利。',
          ],
        },
        {
          heading: '信息如何共享',
          paragraphs: [
            'Cloudflare 提供用于接收和存储联系咨询的 Pages 托管、Workers 运行环境、网络保护与 D1 数据库。Cloudflare 可能在多个国家或地区运行的基础设施上处理信息。',
            '联系系统支持可选通知处理器，目前尚未配置可选 webhook 通知处理器。若未来启用，咨询内容可能被发送给该处理器以提醒我们的团队；届时我们会选择适当的提供商并在需要时更新本说明。通知失败不会删除已存储在 D1 中的咨询。',
            '我们还可能在适当的合同或运营控制下，与帮助我们安全运营网站或沟通的服务提供商共享信息；也可能在适用法律要求、保护权利或安全，或在具有适当保障的业务重组中披露信息。',
            '我们不会将通过本网站处理个人信息描述为出售个人信息。',
          ],
        },
        {
          heading: '保留期限',
          paragraphs: [
            '联系表单提交内容通常计划在接受后 12 个月删除。每条记录都包含 retention_until 日期，以便审计删除流程。若咨询不再需要或我们收到经核实的请求，也可能提前删除。',
            '在维护必要业务记录、解决争议、防止滥用、执行协议或遵守适用法律所合理需要时，我们可能延长保留期限。直接邮件以及转入活跃客户、支持或合同记录的信息，可能适用该记录自身的保留期限。',
          ],
        },
        {
          heading: '跨境处理',
          paragraphs: [
            'Cloudflare 网络与 D1 服务、我们的人员及获批准的服务提供商可能在您居住地以外的国家或地区处理信息。法律要求时，我们会采用适当的合同、组织或法律措施。隐私保护与法律权利可能因地区而异。',
          ],
        },
        {
          heading: '您的选择与权利',
          paragraphs: [
            '根据您的所在地，您可能有权请求访问、更正、删除、限制、反对或移转某些个人信息，或在处理基于同意时撤回同意。这些权利可能受法律例外限制。',
            '如需请求访问、更正或删除，请发送邮件至 info@cinagroup.com。如有联系表单参考编号，请一并提供；除非我们明确提供合适的核实方式，否则请勿发送身份证件。采取行动前我们可能需要核实请求，并可能在法律例外适用时保留有限信息。',
          ],
        },
        {
          heading: '儿童',
          paragraphs: ['本网站面向企业与一般受众，并非面向儿童。请勿通过联系表单提交儿童信息。'],
        },
        {
          heading: '外部网站',
          paragraphs: [
            '本网站链接到产品网站、社交平台、源代码托管与其他外部服务。这些服务的隐私实践受其自身政策约束。提供个人信息前请先查看相关政策。',
          ],
        },
        {
          heading: '政策变更',
          paragraphs: [
            '当网站、服务或法律义务发生变化时，我们可能更新本政策。页面顶部日期表示当前版本的最后更新时间。',
          ],
        },
        {
          heading: '联系我们',
          paragraphs: ['隐私相关问题或请求可发送至 info@cinagroup.com。'],
        },
      ],
    },
    terms: {
      title: '服务条款',
      description: '说明使用海内集团公开网站时适用的条款。',
      updated: '最后更新：2026 年 8 月 4 日',
      noticeTitle: '重要翻译说明',
      notice:
        '本中文版本仅为方便阅读而提供，尚未完成由当地法律专业人士进行的法律审查。如中文版本与英文版本不一致，在适用法律允许的范围内，以英文版本为准。',
      englishLink: '阅读正式英文版本',
      intro:
        '本服务条款适用于您对 cinagroup.com 公开网站的使用。产品网站、账户、付费服务、源代码仓库或单独合作可能另有适用条款。',
      sections: [
        {
          heading: '接受条款',
          paragraphs: ['访问或使用本网站即表示您同意这些条款。如不同意，请勿使用本网站。'],
        },
        {
          heading: '网站用途',
          paragraphs: [
            '本网站提供关于海内集团、产品、服务与公开资料的一般信息。网站内容不构成有约束力的要约、服务等级承诺、可用性保证，也不承诺所述能力在所有产品、地区、方案或环境中均可用。',
            '具体工作、订阅、许可、交付物、价格、支持与验收标准必须在适用订单、协议、产品条款或书面确认中列明。',
          ],
        },
        {
          heading: '允许的使用',
          paragraphs: ['您可以出于合法目的浏览并链接本公开网站。您不得：'],
          bullets: [
            '干扰网站、其基础设施或其他用户；',
            '试图未经授权访问系统、账户或数据；',
            '引入恶意软件、滥用流量或对服务造成不合理负担的自动化活动；',
            '虚假陈述身份或关联关系；',
            '利用网站违反适用法律或他人权利；或',
            '除法律或书面许可允许外，复制、再发布或利用受保护内容。',
          ],
        },
        {
          heading: '知识产权',
          paragraphs: [
            '除非另有说明，网站设计、品牌、原创文本及其他海内集团资料均由海内集团拥有或获授权使用。第三方名称、商标、软件与内容仍归各自权利人所有。',
            '公开源代码仓库可能适用相应仓库内的许可证。仓库许可证不会自动授予海内集团商标、私有服务或无关网站内容的权利。',
          ],
        },
        {
          heading: '外部链接',
          paragraphs: [
            '链接可能将您带到海内集团产品网站或第三方服务。我们无法控制所有外部网站，也不对其内容、可用性、安全性或隐私实践负责。链接本身不代表认可。',
          ],
        },
        {
          heading: '通信',
          paragraphs: [
            '联系我们时，您应对选择发送的信息负责。请勿通过普通电子邮件发送秘密或敏感信息。除非另有书面协议，咨询不会建立保密、信义、雇佣、合伙或客户关系。',
          ],
        },
        {
          heading: '可用性与变更',
          paragraphs: [
            '我们可能变更、暂停或移除网站内容或功能。我们会努力保持公开信息有用，但不保证每个页面始终可用、完整、最新或无错误。',
          ],
        },
        {
          heading: '免责声明',
          paragraphs: [
            '在适用法律允许的范围内，本网站按“现状”和“可用”基础提供，不附带任何明示、默示或法定保证。本网站内容不构成法律、财务、安全或其他受监管的专业建议。',
            '部分司法管辖区不允许排除某些保证，因此本节部分内容可能不适用于您。',
          ],
        },
        {
          heading: '责任限制',
          paragraphs: [
            '在适用法律允许的范围内，海内集团及贡献者不对因使用或无法使用公开网站而产生的间接、附带、特殊、后果性或惩罚性损害，以及利润、收入、数据、商誉或商业机会损失承担责任。',
            '本条款不排除或限制依法不得排除或限制的责任。',
          ],
        },
        {
          heading: '赔偿责任',
          paragraphs: ['法律允许时，您同意对因非法滥用网站或违反本条款而产生的损失、索赔或费用负责。'],
        },
        {
          heading: '条款变更',
          paragraphs: [
            '当网站、服务或适用要求发生变化时，我们可能更新本条款。更新后的条款在发布时生效，但适用法律要求另行通知的除外。',
          ],
        },
        {
          heading: '一般规定',
          paragraphs: [
            '如果某项条款不可执行，其余条款仍然有效。未执行某项条款不构成权利放弃。本网站条款不会取代您与海内集团之间的任何单独书面协议。',
          ],
        },
        {
          heading: '联系我们',
          paragraphs: ['有关本条款的问题可发送至 info@cinagroup.com。'],
        },
      ],
    },
  },
  ja: {
    privacy: {
      title: 'プライバシーポリシー',
      description: 'CinaGroup の公開ウェブサイトとお問い合わせフォームにおける情報の取扱いについて説明します。',
      updated: '最終更新日：2026年8月31日',
      noticeTitle: '翻訳に関する重要なお知らせ',
      notice:
        'この日本語版は便宜のための翻訳であり、現地法の専門家による法的審査は完了していません。英語版と内容が一致しない場合は、適用法で認められる範囲で英語版を優先します。',
      englishLink: '英語の正式版を読む',
      intro:
        '本ポリシーは、cinagroup.com の閲覧時または掲載された連絡手段の利用時に、CinaGroup が情報をどのように扱うかを説明します。',
      sections: [
        {
          heading: '概要',
          paragraphs: ['ウェブサイト用アカウントを作成せずに公開ページを閲覧できます。'],
          bullets: [
            'お問い合わせフォームに入力した情報は CinaGroup のエンドポイントへ送信され、受理された問い合わせは Cloudflare D1 に保存されます。',
            'ホスティングおよびセキュリティ提供者は、サイトの配信と保護に必要な標準的な技術情報を処理する場合があります。',
            '外部サイトには、それぞれのプライバシーポリシーが適用されます。',
          ],
        },
        {
          heading: '提供いただく情報',
          paragraphs: [
            'フォーム送信時には、送信参照番号、時刻、保存期限、フォーム言語、氏名、メールアドレス、任意の会社名、問い合わせ分類と本文、処理状態、通知状態、受信ホスト名を保存します。',
            'お問い合わせデータベースは IP アドレスやブラウザーのユーザーエージェントを意図的に保存しません。ただし Cloudflare はネットワーク保護のために技術情報を別途処理する場合があります。直接メールには本文と通常のメールメタデータが含まれます。',
            'パスワード、API キー、決済カード情報、公的識別番号、健康情報などの機微情報をフォームや通常のメールで送信しないでください。',
          ],
        },
        {
          heading: '技術情報と保存技術',
          paragraphs: [
            '配信、障害調査、不正利用防止、信頼性維持のため、ネットワークシステムは IP アドレス、要求時刻、ページ、端末・ブラウザー情報、参照元、セキュリティ信号を処理する場合があります。',
            '公開ページの閲覧に広告プロファイルは不要です。提供者はセキュリティ、トラフィック管理、基本機能に必要な保存技術を使用する場合があります。',
          ],
        },
        {
          heading: '利用目的',
          paragraphs: [
            '問い合わせへの回答、業務範囲の検討、サイトの運用・保護・改善、不正利用防止、法令遵守、法的請求への対応に必要な範囲で情報を利用します。',
          ],
        },
        {
          heading: '共有と国際的な処理',
          paragraphs: [
            'Cloudflare は Pages、Workers、ネットワーク保護、D1 を提供し、複数国のインフラで情報を処理する場合があります。任意の通知 Webhook は現在設定されていません。将来設定する場合は適切な提供者を選び、本通知を更新します。',
            '運用を支援する提供者、法的義務、権利・安全の保護、適切な保護措置を伴う組織再編のために情報を共有する場合があります。本サイトを通じた個人情報の販売は行っているとは説明していません。',
          ],
        },
        {
          heading: '保存期間',
          paragraphs: [
            'フォーム送信は通常、受理から12か月後の削除予定日を記録します。必要性がなくなった場合や確認済みの請求に応じて早期削除することがあります。法令、紛争、濫用防止、契約上の記録に必要な場合はより長く保存することがあります。',
          ],
        },
        {
          heading: '選択肢と権利',
          paragraphs: [
            '居住地により、アクセス、訂正、削除、制限、異議、データ移転、同意撤回などの権利が認められる場合があります。例外が適用されることがあります。請求は info@cinagroup.com へ送り、分かる場合はフォーム参照番号を記載してください。適切な方法で本人確認をお願いすることがあります。',
          ],
        },
        {
          heading: '子ども、外部サイト、変更',
          paragraphs: [
            '本サイトは事業者および一般向けで、子どもを対象としていません。外部サイトには各提供者の方針が適用されます。本ポリシーを更新した場合は、ページ上部の日付を変更します。',
          ],
        },
        {
          heading: 'お問い合わせ',
          paragraphs: ['プライバシーに関する質問や請求は info@cinagroup.com へお送りください。'],
        },
      ],
    },
    terms: {
      title: '利用規約',
      description: 'CinaGroup の公開ウェブサイトを利用する際の条件を説明します。',
      updated: '最終更新日：2026年8月4日',
      noticeTitle: '翻訳に関する重要なお知らせ',
      notice:
        'この日本語版は便宜のための翻訳であり、現地法の専門家による法的審査は完了していません。英語版と内容が一致しない場合は、適用法で認められる範囲で英語版を優先します。',
      englishLink: '英語の正式版を読む',
      intro:
        '本規約は cinagroup.com の公開ウェブサイトに適用されます。製品サイト、アカウント、有料サービス、ソースコード、個別契約には追加条件が適用される場合があります。',
      sections: [
        {
          heading: '同意',
          paragraphs: [
            '本サイトにアクセスまたは利用することで本規約に同意します。同意しない場合は利用しないでください。',
          ],
        },
        {
          heading: 'サイトの目的と取引条件',
          paragraphs: [
            '本サイトは CinaGroup、製品、サービス、公開資料に関する一般情報を提供します。内容は拘束力のある申込み、SLA、可用性保証、または全地域・プランでの機能提供の約束ではありません。',
            '具体的な作業、価格、納品物、ライセンス、サポート、受入条件は、該当する注文、契約、製品条件、または書面確認で定めます。',
          ],
        },
        {
          heading: '許可される利用',
          paragraphs: ['適法な目的で公開サイトを閲覧し、リンクできます。次の行為は禁止します。'],
          bullets: [
            'サイト、インフラ、他の利用者を妨害する行為',
            'システム、アカウント、データへの不正アクセス',
            'マルウェア、濫用的トラフィック、過度な自動アクセス',
            '身元や所属の詐称',
            '法令または第三者の権利を侵害する利用',
            '法令または書面許可を超えた保護コンテンツの複製・利用',
          ],
        },
        {
          heading: '知的財産',
          paragraphs: [
            '別途記載がない限り、サイトのデザイン、ブランド、原文その他の資料は CinaGroup が所有またはライセンスを受けています。第三者の権利は各権利者に帰属します。公開リポジトリには当該リポジトリのライセンスが適用され、商標や別サービスへの権利を自動的に付与するものではありません。',
          ],
        },
        {
          heading: '外部リンクと連絡',
          paragraphs: [
            '外部サイトの内容、可用性、セキュリティ、プライバシーを当社が管理するとは限らず、リンクだけで推奨を意味しません。連絡時に送る情報は送信者の責任です。問い合わせだけで秘密保持、信認、雇用、提携、顧客関係は成立しません。',
          ],
        },
        {
          heading: '可用性と免責',
          paragraphs: [
            '内容や機能を変更、停止、削除する場合があります。完全性、継続性、正確性、無エラーを保証しません。適用法で認められる範囲で、本サイトは「現状有姿」かつ「提供可能な範囲」で提供され、法務、金融、セキュリティその他の規制対象の専門助言ではありません。地域により免責の一部が適用されない場合があります。',
          ],
        },
        {
          heading: '責任の制限と補償',
          paragraphs: [
            '適用法で認められる範囲で、CinaGroup および貢献者は、間接・付随・特別・結果的・懲罰的損害、または利益、収益、データ、信用、機会の損失に責任を負いません。法律上排除できない責任は除外しません。許される範囲で、違法利用や規約違反に起因する損失等の責任を負うことがあります。',
          ],
        },
        {
          heading: '変更と一般条項',
          paragraphs: [
            '本規約を更新する場合があります。法令上の通知が必要な場合を除き、掲載時に改定版が有効になります。条項の一部が執行不能でも残りは有効です。権利を行使しないことは放棄を意味しません。別途締結した書面契約を本規約が置き換えるものではありません。',
          ],
        },
        { heading: 'お問い合わせ', paragraphs: ['本規約に関する質問は info@cinagroup.com へお送りください。'] },
      ],
    },
  },
  ko: {
    privacy: {
      title: '개인정보 보호정책',
      description: 'CinaGroup 공개 웹사이트와 문의 양식에서 정보를 처리하는 방식을 설명합니다.',
      updated: '최종 업데이트: 2026년 8월 31일',
      noticeTitle: '번역에 관한 중요 안내',
      notice:
        '이 한국어 문서는 편의를 위한 번역이며 현지 법률 전문가의 검토가 완료되지 않았습니다. 영어본과 내용이 다르면 관련 법률이 허용하는 범위에서 영어본이 우선합니다.',
      englishLink: '영어 공식본 보기',
      intro:
        '이 정책은 cinagroup.com을 방문하거나 웹사이트에 게시된 연락 수단을 이용할 때 CinaGroup이 정보를 처리하는 방식을 설명합니다.',
      sections: [
        {
          heading: '요약',
          paragraphs: ['웹사이트 계정을 만들지 않고 공개 페이지를 볼 수 있습니다.'],
          bullets: [
            '문의 양식에 입력한 정보는 CinaGroup 엔드포인트로 전송되며 접수된 문의는 Cloudflare D1에 저장됩니다.',
            '호스팅 및 보안 제공자가 사이트 제공과 보호에 필요한 표준 기술 정보를 처리할 수 있습니다.',
            '외부 사이트에는 해당 사이트의 개인정보 정책이 적용됩니다.',
          ],
        },
        {
          heading: '직접 제공하는 정보',
          paragraphs: [
            '양식을 보내면 제출 참조 번호와 시간, 보존 기한, 언어, 이름, 이메일, 선택 입력한 회사, 문의 분류와 메시지, 처리 및 알림 상태, 수신 호스트 이름을 저장합니다.',
            '문의 데이터베이스는 IP 주소나 브라우저 사용자 에이전트를 의도적으로 저장하지 않습니다. Cloudflare는 네트워크 보호를 위해 기술 정보를 별도로 처리할 수 있고, 직접 보낸 이메일에는 일반적인 메일 메타데이터가 포함됩니다.',
            '비밀번호, API 키, 결제 카드 정보, 정부 식별자, 건강 정보 등 민감한 정보를 양식이나 일반 이메일로 보내지 마십시오.',
          ],
        },
        {
          heading: '기술 정보와 저장 기술',
          paragraphs: [
            '사이트 제공, 오류 조사, 남용 방지, 신뢰성 유지를 위해 네트워크 시스템이 IP 주소, 요청 시각, 페이지, 기기·브라우저 정보, 참조 페이지, 보안 신호를 처리할 수 있습니다.',
            '공개 페이지를 보기 위해 광고 프로필이 필요하지 않습니다. 제공자는 보안, 트래픽 관리, 핵심 기능에 필요한 저장 기술을 사용할 수 있습니다.',
          ],
        },
        {
          heading: '이용 목적',
          paragraphs: [
            '문의 답변, 업무 범위 검토, 사이트 운영·보호·개선, 사기 및 남용 방지, 법적 의무 이행, 법적 청구 대응과 합리적으로 관련된 목적으로만 사용합니다.',
          ],
        },
        {
          heading: '공유 및 국제 처리',
          paragraphs: [
            'Cloudflare는 Pages, Workers, 네트워크 보호, D1을 제공하며 여러 국가의 인프라에서 정보를 처리할 수 있습니다. 선택형 알림 웹후크는 현재 설정되어 있지 않습니다. 추후 설정할 경우 적절한 제공자를 선택하고 이 안내를 갱신합니다.',
            '운영 제공자, 법적 요구, 권리·안전 보호 또는 적절한 보호조치가 있는 조직 개편을 위해 정보를 공유할 수 있습니다. 이 웹사이트를 통한 개인정보 판매를 한다고 설명하지 않습니다.',
          ],
        },
        {
          heading: '보존',
          paragraphs: [
            '양식 제출은 일반적으로 접수 후 12개월의 삭제 예정일을 기록합니다. 필요가 없어지거나 확인된 요청이 있으면 더 일찍 삭제할 수 있습니다. 법률, 분쟁, 남용 방지 또는 계약 기록에 필요하면 더 오래 보존할 수 있습니다.',
          ],
        },
        {
          heading: '선택과 권리',
          paragraphs: [
            '거주 지역에 따라 열람, 정정, 삭제, 제한, 반대, 이동 또는 동의 철회 권리가 있을 수 있으며 예외가 적용될 수 있습니다. info@cinagroup.com으로 요청하고 알고 있다면 문의 참조 번호를 포함하십시오. 적절한 방식의 본인 확인이 필요할 수 있습니다.',
          ],
        },
        {
          heading: '아동, 외부 사이트, 변경',
          paragraphs: [
            '사이트는 사업 및 일반 이용자를 위한 것이며 아동을 대상으로 하지 않습니다. 외부 사이트에는 각 제공자의 정책이 적용됩니다. 정책을 변경하면 상단의 날짜를 갱신합니다.',
          ],
        },
        { heading: '문의', paragraphs: ['개인정보 질문이나 요청은 info@cinagroup.com으로 보내십시오.'] },
      ],
    },
    terms: {
      title: '서비스 약관',
      description: 'CinaGroup 공개 웹사이트를 이용할 때 적용되는 조건을 설명합니다.',
      updated: '최종 업데이트: 2026년 8월 4일',
      noticeTitle: '번역에 관한 중요 안내',
      notice:
        '이 한국어 문서는 편의를 위한 번역이며 현지 법률 전문가의 검토가 완료되지 않았습니다. 영어본과 내용이 다르면 관련 법률이 허용하는 범위에서 영어본이 우선합니다.',
      englishLink: '영어 공식본 보기',
      intro:
        '이 약관은 cinagroup.com의 공개 웹사이트에 적용됩니다. 제품 사이트, 계정, 유료 서비스, 소스 코드 저장소 또는 개별 계약에는 추가 조건이 적용될 수 있습니다.',
      sections: [
        {
          heading: '동의',
          paragraphs: [
            '웹사이트에 접근하거나 이용하면 이 약관에 동의하는 것입니다. 동의하지 않으면 이용하지 마십시오.',
          ],
        },
        {
          heading: '웹사이트 목적과 상업 조건',
          paragraphs: [
            '이 사이트는 CinaGroup, 제품, 서비스, 공개 자료에 대한 일반 정보를 제공합니다. 내용은 구속력 있는 제안, SLA, 가용성 보장 또는 모든 지역·요금제에서의 기능 제공 약속이 아닙니다.',
            '구체적인 업무, 가격, 산출물, 라이선스, 지원, 인수 기준은 해당 주문, 계약, 제품 조건 또는 서면 확인으로 정합니다.',
          ],
        },
        {
          heading: '허용되는 이용',
          paragraphs: ['합법적인 목적으로 공개 사이트를 보고 링크할 수 있습니다. 다음 행위는 금지됩니다.'],
          bullets: [
            '사이트, 인프라 또는 다른 이용자 방해',
            '시스템, 계정 또는 데이터에 대한 무단 접근',
            '악성코드, 남용 트래픽 또는 과도한 자동 요청',
            '신원이나 소속 허위 표시',
            '법률 또는 타인의 권리를 침해하는 이용',
            '법률이나 서면 허가를 넘는 보호 콘텐츠 복제 또는 이용',
          ],
        },
        {
          heading: '지식재산권',
          paragraphs: [
            '달리 표시하지 않는 한 사이트 디자인, 브랜드, 원문 및 기타 자료는 CinaGroup이 소유하거나 사용 허가를 받았습니다. 제3자 권리는 해당 권리자에게 있습니다. 공개 저장소의 라이선스는 해당 저장소에 적용되며 상표나 별도 서비스의 권리를 자동으로 주지 않습니다.',
          ],
        },
        {
          heading: '외부 링크와 연락',
          paragraphs: [
            '외부 사이트의 콘텐츠, 가용성, 보안, 개인정보를 당사가 모두 통제하지 않으며 링크만으로 보증을 뜻하지 않습니다. 연락할 때 보내는 정보는 발신자가 책임집니다. 문의만으로 비밀유지, 신인의무, 고용, 파트너십 또는 고객 관계가 생기지 않습니다.',
          ],
        },
        {
          heading: '가용성과 면책',
          paragraphs: [
            '콘텐츠나 기능을 변경, 중단 또는 삭제할 수 있으며 완전성, 지속성, 정확성, 무오류를 보장하지 않습니다. 법이 허용하는 범위에서 사이트는 “있는 그대로”, “이용 가능한 상태로” 제공되며 법률, 금융, 보안 등 규제 전문 조언이 아닙니다. 일부 지역에서는 면책의 일부가 적용되지 않을 수 있습니다.',
          ],
        },
        {
          heading: '책임 제한과 배상',
          paragraphs: [
            '법이 허용하는 범위에서 CinaGroup과 기여자는 간접, 부수, 특별, 결과적, 징벌적 손해나 이익, 매출, 데이터, 신용, 기회 손실에 책임지지 않습니다. 법적으로 배제할 수 없는 책임은 제외하지 않습니다. 허용되는 경우 불법 이용이나 약관 위반으로 발생한 손실 등에 책임을 질 수 있습니다.',
          ],
        },
        {
          heading: '변경 및 일반 조항',
          paragraphs: [
            '약관을 변경할 수 있습니다. 법률상 별도 통지가 필요한 경우를 제외하고 게시 시 개정본이 적용됩니다. 일부 조항이 집행 불가능해도 나머지는 유지됩니다. 권리를 행사하지 않았다고 포기한 것은 아닙니다. 별도 서면 계약을 이 약관이 대체하지 않습니다.',
          ],
        },
        { heading: '문의', paragraphs: ['약관에 대한 질문은 info@cinagroup.com으로 보내십시오.'] },
      ],
    },
  },
  ru: {
    privacy: {
      title: 'Политика конфиденциальности',
      description: 'Как CinaGroup обрабатывает информацию на публичном сайте и в форме обратной связи.',
      updated: 'Обновлено 31 августа 2026 года',
      noticeTitle: 'Важное уведомление о переводе',
      notice:
        'Этот русский текст предоставлен для удобства и еще не прошел проверку специалистом по местному праву. При расхождениях с английской версией в пределах, разрешенных законом, применяется английская версия.',
      englishLink: 'Открыть официальную английскую версию',
      intro:
        'Политика объясняет, как CinaGroup обращается с информацией при посещении cinagroup.com или использовании опубликованных на сайте способов связи.',
      sections: [
        {
          heading: 'Кратко',
          paragraphs: ['Публичные страницы можно просматривать без учетной записи сайта.'],
          bullets: [
            'Данные из формы отправляются в CinaGroup, а принятые обращения хранятся в Cloudflare D1.',
            'Провайдеры хостинга и безопасности могут обрабатывать стандартные технические данные для доставки и защиты сайта.',
            'На внешних сайтах действуют их собственные политики.',
          ],
        },
        {
          heading: 'Данные, которые вы предоставляете',
          paragraphs: [
            'При отправке формы мы сохраняем номер и время обращения, срок хранения, язык, имя, email, необязательное название компании, категорию и текст обращения, статусы обработки и уведомления, а также имя хоста.',
            'База обращений намеренно не хранит IP-адрес и user agent браузера. Cloudflare может отдельно обрабатывать технические сведения для защиты сети; прямое письмо содержит обычные почтовые метаданные.',
            'Не отправляйте пароли, API-ключи, платежные данные, государственные идентификаторы, медицинские и другие чувствительные сведения.',
          ],
        },
        {
          heading: 'Технические данные и хранилища',
          paragraphs: [
            'Для доставки сайта, расследования ошибок, предотвращения злоупотреблений и надежности сетевые системы могут обрабатывать IP-адрес, время запроса, страницу, данные устройства и браузера, источник перехода и сигналы безопасности.',
            'Для просмотра не требуется рекламный профиль. Провайдеры могут использовать необходимое хранилище для безопасности, управления трафиком и основных функций.',
          ],
        },
        {
          heading: 'Цели обработки',
          paragraphs: [
            'Мы используем сведения для ответа на обращения, оценки работ, эксплуатации, защиты и улучшения сайта, предотвращения злоупотреблений, выполнения закона и защиты юридических требований.',
          ],
        },
        {
          heading: 'Передача и международная обработка',
          paragraphs: [
            'Cloudflare предоставляет Pages, Workers, сетевую защиту и D1 и может обрабатывать данные в разных странах. Дополнительный webhook уведомлений сейчас не настроен; при его включении мы выберем подходящего провайдера и обновим уведомление.',
            'Сведения могут передаваться операционным подрядчикам, по требованию закона, для защиты прав и безопасности либо при реорганизации с надлежащими гарантиями. Мы не заявляем о продаже персональных данных через этот сайт.',
          ],
        },
        {
          heading: 'Срок хранения',
          paragraphs: [
            'Для обращений обычно назначается удаление через 12 месяцев после приема. Мы можем удалить данные раньше, когда они больше не нужны или поступил подтвержденный запрос, либо хранить дольше для закона, споров, предотвращения злоупотреблений или договорной документации.',
          ],
        },
        {
          heading: 'Ваши права',
          paragraphs: [
            'В зависимости от места проживания могут действовать права на доступ, исправление, удаление, ограничение, возражение, переносимость или отзыв согласия с предусмотренными законом исключениями. Пишите на info@cinagroup.com и укажите номер обращения, если он известен. Может потребоваться разумная проверка личности.',
          ],
        },
        {
          heading: 'Дети, внешние сайты и изменения',
          paragraphs: [
            'Сайт предназначен для деловой и широкой аудитории, а не для детей. На внешних сайтах действуют политики их владельцев. При изменении политики мы обновим дату вверху страницы.',
          ],
        },
        {
          heading: 'Контакты',
          paragraphs: ['Вопросы и запросы о конфиденциальности направляйте на info@cinagroup.com.'],
        },
      ],
    },
    terms: {
      title: 'Условия использования',
      description: 'Условия использования публичного сайта CinaGroup.',
      updated: 'Обновлено 4 августа 2026 года',
      noticeTitle: 'Важное уведомление о переводе',
      notice:
        'Этот русский текст предоставлен для удобства и еще не прошел проверку специалистом по местному праву. При расхождениях с английской версией в пределах, разрешенных законом, применяется английская версия.',
      englishLink: 'Открыть официальную английскую версию',
      intro:
        'Условия применяются к публичному сайту cinagroup.com. Для сайтов продуктов, учетных записей, платных услуг, репозиториев и отдельных проектов могут действовать дополнительные условия.',
      sections: [
        {
          heading: 'Согласие',
          paragraphs: [
            'Заходя на сайт или используя его, вы соглашаетесь с условиями. Если вы не согласны, не используйте сайт.',
          ],
        },
        {
          heading: 'Назначение сайта и коммерческие условия',
          paragraphs: [
            'Сайт содержит общую информацию о CinaGroup, продуктах, услугах и материалах. Она не является обязательной офертой, SLA, гарантией доступности или обещанием каждой функции во всех регионах и тарифах.',
            'Конкретные работы, цены, результаты, лицензии, поддержка и критерии приемки определяются заказом, договором, условиями продукта или письменным подтверждением.',
          ],
        },
        {
          heading: 'Разрешенное использование',
          paragraphs: ['Публичный сайт можно просматривать и цитировать ссылкой в законных целях. Запрещено:'],
          bullets: [
            'мешать сайту, инфраструктуре или другим пользователям',
            'получать несанкционированный доступ к системам, учетным записям или данным',
            'распространять вредоносный код, злоупотреблять трафиком или чрезмерной автоматизацией',
            'искажать личность или принадлежность',
            'нарушать закон или чужие права',
            'копировать защищенные материалы сверх разрешенного законом или письменно',
          ],
        },
        {
          heading: 'Интеллектуальная собственность',
          paragraphs: [
            'Если не указано иное, дизайн, брендинг, оригинальный текст и другие материалы принадлежат CinaGroup или используются по лицензии. Права третьих лиц остаются у их владельцев. Лицензия публичного репозитория не дает автоматически прав на товарные знаки или отдельные сервисы.',
          ],
        },
        {
          heading: 'Внешние ссылки и сообщения',
          paragraphs: [
            'Мы не контролируем содержание, доступность, безопасность и конфиденциальность всех внешних сайтов; ссылка сама по себе не означает одобрения. Отправитель отвечает за сведения в сообщении. Обращение само по себе не создает конфиденциальных, фидуциарных, трудовых, партнерских или клиентских отношений.',
          ],
        },
        {
          heading: 'Доступность и отказ от гарантий',
          paragraphs: [
            'Мы можем изменить, приостановить или удалить материалы и функции и не гарантируем их полноту, постоянство, точность или отсутствие ошибок. В пределах закона сайт предоставляется «как есть» и «по мере доступности» и не является юридической, финансовой, информационно-безопасностной или иной регулируемой консультацией. В некоторых юрисдикциях часть исключений не действует.',
          ],
        },
        {
          heading: 'Ограничение ответственности и возмещение',
          paragraphs: [
            'В пределах закона CinaGroup и участники не отвечают за косвенные, случайные, специальные, последующие или штрафные убытки либо потерю прибыли, выручки, данных, репутации или возможности. Мы не исключаем ответственность, которую нельзя исключить по закону. Там, где разрешено, пользователь отвечает за убытки из-за незаконного использования или нарушения условий.',
          ],
        },
        {
          heading: 'Изменения и общие положения',
          paragraphs: [
            'Мы можем обновлять условия. Если закон не требует отдельного уведомления, новая версия действует с публикации. Недействительность одного положения не отменяет остальные; неиспользование права не является отказом. Эти условия не заменяют отдельный письменный договор.',
          ],
        },
        { heading: 'Контакты', paragraphs: ['Вопросы об условиях направляйте на info@cinagroup.com.'] },
      ],
    },
  },
  es: {
    privacy: {
      title: 'Política de privacidad',
      description: 'Cómo trata CinaGroup la información en su sitio público y formulario de contacto.',
      updated: 'Última actualización: 31 de agosto de 2026',
      noticeTitle: 'Aviso importante sobre la traducción',
      notice:
        'Esta versión en español se ofrece por comodidad y aún no ha sido revisada por un profesional del derecho local. Si difiere de la versión inglesa, prevalecerá la versión inglesa en la medida permitida por la ley aplicable.',
      englishLink: 'Leer la versión oficial en inglés',
      intro:
        'Esta política explica cómo trata CinaGroup la información cuando visita cinagroup.com o utiliza los canales de contacto publicados en el sitio.',
      sections: [
        {
          heading: 'Resumen',
          paragraphs: ['Puede navegar por las páginas públicas sin crear una cuenta del sitio.'],
          bullets: [
            'La información del formulario se envía a un endpoint de CinaGroup y las consultas aceptadas se guardan en Cloudflare D1.',
            'Los proveedores de alojamiento y seguridad pueden tratar datos técnicos estándar para entregar y proteger el sitio.',
            'Los sitios externos tienen sus propias políticas.',
          ],
        },
        {
          heading: 'Información que proporciona',
          paragraphs: [
            'Al enviar el formulario guardamos la referencia y hora, fecha prevista de eliminación, idioma, nombre, email, empresa opcional, categoría y mensaje, estados operativos y de notificación, y hostname receptor.',
            'La base de consultas no guarda intencionalmente la dirección IP ni el user agent. Cloudflare puede tratar datos técnicos por separado para proteger la red; un correo directo incluye metadatos habituales.',
            'No envíe contraseñas, claves API, datos de tarjeta, identificadores oficiales, datos médicos ni otra información sensible.',
          ],
        },
        {
          heading: 'Información técnica y almacenamiento',
          paragraphs: [
            'Para entregar el sitio, investigar errores, evitar abusos y mantener la fiabilidad, los sistemas pueden tratar IP, hora, página, datos de dispositivo o navegador, referente y señales de seguridad.',
            'No se exige un perfil publicitario para navegar. Los proveedores pueden usar almacenamiento esencial para seguridad, tráfico y funciones básicas.',
          ],
        },
        {
          heading: 'Finalidades',
          paragraphs: [
            'Usamos la información para responder consultas, evaluar trabajo, operar, proteger y mejorar el sitio, prevenir fraude o abuso, cumplir obligaciones legales y atender reclamaciones.',
          ],
        },
        {
          heading: 'Compartición y tratamiento internacional',
          paragraphs: [
            'Cloudflare proporciona Pages, Workers, protección de red y D1, y puede tratar información en varios países. No hay configurado actualmente un webhook opcional de notificación; si se habilita, elegiremos un proveedor adecuado y actualizaremos este aviso.',
            'Podemos compartir datos con proveedores operativos, por exigencia legal, para proteger derechos o seguridad, o en una reorganización con salvaguardas. No describimos la información personal como vendida mediante este sitio.',
          ],
        },
        {
          heading: 'Conservación',
          paragraphs: [
            'Las consultas suelen programarse para eliminación 12 meses después de aceptarse. Podemos borrar antes cuando ya no sean necesarias o tras una solicitud verificada, o conservar más por ley, disputas, prevención de abusos o registros contractuales.',
          ],
        },
        {
          heading: 'Opciones y derechos',
          paragraphs: [
            'Según su residencia puede tener derechos de acceso, rectificación, supresión, limitación, oposición, portabilidad o retirada del consentimiento, sujetos a excepciones. Escriba a info@cinagroup.com e incluya la referencia si la conoce. Podemos verificar la identidad de forma adecuada.',
          ],
        },
        {
          heading: 'Menores, sitios externos y cambios',
          paragraphs: [
            'El sitio está dirigido a empresas y público general, no a menores. Los sitios externos se rigen por sus proveedores. Si cambia la política, actualizaremos la fecha superior.',
          ],
        },
        { heading: 'Contacto', paragraphs: ['Envíe preguntas o solicitudes de privacidad a info@cinagroup.com.'] },
      ],
    },
    terms: {
      title: 'Términos de servicio',
      description: 'Condiciones de uso del sitio web público de CinaGroup.',
      updated: 'Última actualización: 4 de agosto de 2026',
      noticeTitle: 'Aviso importante sobre la traducción',
      notice:
        'Esta versión en español se ofrece por comodidad y aún no ha sido revisada por un profesional del derecho local. Si difiere de la versión inglesa, prevalecerá la versión inglesa en la medida permitida por la ley aplicable.',
      englishLink: 'Leer la versión oficial en inglés',
      intro:
        'Estos términos se aplican al sitio público cinagroup.com. Los sitios de productos, cuentas, servicios de pago, repositorios o proyectos separados pueden tener condiciones adicionales.',
      sections: [
        {
          heading: 'Aceptación',
          paragraphs: ['Al acceder o usar el sitio acepta estos términos. Si no está de acuerdo, no lo utilice.'],
        },
        {
          heading: 'Finalidad del sitio y condiciones comerciales',
          paragraphs: [
            'El sitio ofrece información general sobre CinaGroup, productos, servicios y materiales. No es una oferta vinculante, SLA, garantía de disponibilidad ni promesa de funciones en cada región o plan.',
            'Trabajo, precios, entregables, licencias, soporte y aceptación concretos deben constar en el pedido, contrato, términos del producto o confirmación escrita aplicable.',
          ],
        },
        {
          heading: 'Uso permitido',
          paragraphs: ['Puede navegar y enlazar el sitio con fines lícitos. No debe:'],
          bullets: [
            'interferir con el sitio, infraestructura o usuarios',
            'intentar acceso no autorizado a sistemas, cuentas o datos',
            'introducir malware, tráfico abusivo o automatización excesiva',
            'falsear identidad o afiliación',
            'vulnerar la ley o derechos ajenos',
            'copiar o explotar contenido protegido más allá de lo permitido',
          ],
        },
        {
          heading: 'Propiedad intelectual',
          paragraphs: [
            'Salvo indicación distinta, el diseño, marcas, texto original y otros materiales pertenecen o están licenciados a CinaGroup. Los derechos de terceros siguen con sus titulares. La licencia de un repositorio público no concede automáticamente derechos sobre marcas o servicios separados.',
          ],
        },
        {
          heading: 'Enlaces y comunicaciones',
          paragraphs: [
            'No controlamos todo sitio externo ni respondemos por su contenido, disponibilidad, seguridad o privacidad; un enlace no implica respaldo. Usted responde de la información enviada. Una consulta no crea por sí sola relación confidencial, fiduciaria, laboral, societaria o de cliente.',
          ],
        },
        {
          heading: 'Disponibilidad y exclusión de garantías',
          paragraphs: [
            'Podemos cambiar, suspender o retirar contenido o funciones y no garantizamos que sean completos, continuos, exactos o sin errores. En la medida legal, el sitio se ofrece “tal cual” y “según disponibilidad” y no constituye asesoramiento jurídico, financiero, de seguridad u otro regulado. Algunas exclusiones pueden no aplicarse en ciertos lugares.',
          ],
        },
        {
          heading: 'Limitación de responsabilidad e indemnidad',
          paragraphs: [
            'En la medida legal, CinaGroup y sus colaboradores no responden por daños indirectos, incidentales, especiales, consecuentes o punitivos ni por pérdida de beneficio, ingresos, datos, reputación u oportunidad. No se excluye responsabilidad que la ley no permita excluir. Cuando sea legal, usted responde por pérdidas derivadas de uso ilícito o incumplimiento.',
          ],
        },
        {
          heading: 'Cambios y disposiciones generales',
          paragraphs: [
            'Podemos actualizar los términos. Salvo aviso exigido por ley, rigen al publicarse. Si una disposición no es exigible, las demás siguen vigentes; no ejercer un derecho no lo renuncia. Estos términos no sustituyen un acuerdo escrito separado.',
          ],
        },
        { heading: 'Contacto', paragraphs: ['Envíe preguntas sobre estos términos a info@cinagroup.com.'] },
      ],
    },
  },
  pt: {
    privacy: {
      title: 'Política de privacidade',
      description: 'Como a CinaGroup trata informações no site público e no formulário de contato.',
      updated: 'Última atualização: 31 de agosto de 2026',
      noticeTitle: 'Aviso importante sobre a tradução',
      notice:
        'Esta versão em português é fornecida por conveniência e ainda não foi revisada por um profissional do direito local. Se houver divergência com a versão em inglês, a versão em inglês prevalecerá na medida permitida pela lei aplicável.',
      englishLink: 'Ler a versão oficial em inglês',
      intro:
        'Esta política explica como a CinaGroup trata informações quando você visita cinagroup.com ou usa os canais de contato publicados no site.',
      sections: [
        {
          heading: 'Resumo',
          paragraphs: ['Você pode navegar pelas páginas públicas sem criar uma conta no site.'],
          bullets: [
            'Os dados do formulário são enviados a um endpoint da CinaGroup e as consultas aceitas são armazenadas no Cloudflare D1.',
            'Provedores de hospedagem e segurança podem tratar dados técnicos padrão para entregar e proteger o site.',
            'Sites externos têm políticas próprias.',
          ],
        },
        {
          heading: 'Informações fornecidas por você',
          paragraphs: [
            'Ao enviar o formulário, armazenamos referência e horário, data prevista de exclusão, idioma, nome, email, empresa opcional, categoria e mensagem, estados operacionais e de notificação e hostname receptor.',
            'O banco de consultas não armazena intencionalmente IP ou user agent. A Cloudflare pode tratar dados técnicos separadamente para proteger a rede; emails diretos contêm metadados normais.',
            'Não envie senhas, chaves de API, dados de cartão, identificadores oficiais, informações de saúde ou outros dados sensíveis.',
          ],
        },
        {
          heading: 'Informações técnicas e armazenamento',
          paragraphs: [
            'Para entregar o site, investigar erros, prevenir abuso e manter a confiabilidade, sistemas podem tratar IP, horário, página, dispositivo ou navegador, referenciador e sinais de segurança.',
            'Não é necessário um perfil publicitário para navegar. Provedores podem usar armazenamento essencial para segurança, tráfego e funções básicas.',
          ],
        },
        {
          heading: 'Finalidades',
          paragraphs: [
            'Usamos informações para responder, avaliar trabalhos, operar, proteger e melhorar o site, prevenir fraude e abuso, cumprir obrigações legais e lidar com reivindicações.',
          ],
        },
        {
          heading: 'Compartilhamento e tratamento internacional',
          paragraphs: [
            'A Cloudflare fornece Pages, Workers, proteção de rede e D1 e pode tratar informações em vários países. Nenhum webhook opcional de notificação está configurado hoje; se for ativado, escolheremos um provedor adequado e atualizaremos este aviso.',
            'Podemos compartilhar com fornecedores operacionais, por obrigação legal, para proteger direitos ou segurança, ou em reorganização com salvaguardas. Não descrevemos informações pessoais como vendidas por este site.',
          ],
        },
        {
          heading: 'Retenção',
          paragraphs: [
            'Consultas normalmente têm exclusão programada 12 meses após a aceitação. Podemos excluir antes quando não forem mais necessárias ou após pedido verificado, ou reter mais por lei, disputas, prevenção de abuso ou registros contratuais.',
          ],
        },
        {
          heading: 'Escolhas e direitos',
          paragraphs: [
            'Conforme sua residência, você pode ter direitos de acesso, correção, exclusão, limitação, oposição, portabilidade ou retirada do consentimento, sujeitos a exceções. Escreva para info@cinagroup.com e inclua a referência se souber. Podemos verificar sua identidade adequadamente.',
          ],
        },
        {
          heading: 'Crianças, sites externos e mudanças',
          paragraphs: [
            'O site destina-se a empresas e ao público geral, não a crianças. Sites externos seguem as políticas de seus provedores. Se a política mudar, atualizaremos a data acima.',
          ],
        },
        { heading: 'Contato', paragraphs: ['Envie dúvidas ou pedidos de privacidade para info@cinagroup.com.'] },
      ],
    },
    terms: {
      title: 'Termos de serviço',
      description: 'Condições para usar o site público da CinaGroup.',
      updated: 'Última atualização: 4 de agosto de 2026',
      noticeTitle: 'Aviso importante sobre a tradução',
      notice:
        'Esta versão em português é fornecida por conveniência e ainda não foi revisada por um profissional do direito local. Se houver divergência com a versão em inglês, a versão em inglês prevalecerá na medida permitida pela lei aplicável.',
      englishLink: 'Ler a versão oficial em inglês',
      intro:
        'Estes termos se aplicam ao site público cinagroup.com. Sites de produtos, contas, serviços pagos, repositórios ou projetos separados podem ter termos adicionais.',
      sections: [
        {
          heading: 'Aceitação',
          paragraphs: ['Ao acessar ou usar o site, você concorda com estes termos. Se não concordar, não use o site.'],
        },
        {
          heading: 'Finalidade do site e condições comerciais',
          paragraphs: [
            'O site fornece informações gerais sobre a CinaGroup, produtos, serviços e materiais. Não é oferta vinculante, SLA, garantia de disponibilidade nem promessa de recursos em toda região ou plano.',
            'Trabalho, preços, entregas, licenças, suporte e aceitação específicos devem constar no pedido, contrato, termos do produto ou confirmação escrita aplicável.',
          ],
        },
        {
          heading: 'Uso permitido',
          paragraphs: ['Você pode navegar e criar links para fins legais. É proibido:'],
          bullets: [
            'interferir no site, infraestrutura ou usuários',
            'buscar acesso não autorizado a sistemas, contas ou dados',
            'introduzir malware, tráfego abusivo ou automação excessiva',
            'falsear identidade ou vínculo',
            'violar a lei ou direitos de terceiros',
            'copiar ou explorar conteúdo protegido além do permitido',
          ],
        },
        {
          heading: 'Propriedade intelectual',
          paragraphs: [
            'Salvo indicação contrária, design, marcas, texto original e outros materiais pertencem ou são licenciados à CinaGroup. Direitos de terceiros permanecem com seus titulares. Licença de repositório público não concede automaticamente direitos sobre marcas ou serviços separados.',
          ],
        },
        {
          heading: 'Links e comunicações',
          paragraphs: [
            'Não controlamos todos os sites externos nem respondemos por conteúdo, disponibilidade, segurança ou privacidade; um link não significa endosso. Você responde pelas informações enviadas. Uma consulta não cria por si relação confidencial, fiduciária, trabalhista, societária ou de cliente.',
          ],
        },
        {
          heading: 'Disponibilidade e isenção',
          paragraphs: [
            'Podemos mudar, suspender ou remover conteúdo e funções e não garantimos completude, continuidade, precisão ou ausência de erros. Na medida legal, o site é fornecido “no estado em que se encontra” e “conforme disponível” e não é aconselhamento jurídico, financeiro, de segurança ou outro regulado. Algumas exclusões podem não valer em certos locais.',
          ],
        },
        {
          heading: 'Limitação de responsabilidade e indenização',
          paragraphs: [
            'Na medida legal, a CinaGroup e colaboradores não respondem por danos indiretos, incidentais, especiais, consequentes ou punitivos nem por perda de lucro, receita, dados, reputação ou oportunidade. Não excluímos responsabilidade que a lei não permite excluir. Quando permitido, você responde por perdas de uso ilegal ou violação dos termos.',
          ],
        },
        {
          heading: 'Mudanças e disposições gerais',
          paragraphs: [
            'Podemos atualizar os termos. Salvo aviso exigido por lei, a versão nova vale ao ser publicada. Se uma cláusula for inexigível, as demais continuam; não exercer um direito não é renúncia. Estes termos não substituem acordo escrito separado.',
          ],
        },
        { heading: 'Contato', paragraphs: ['Envie perguntas sobre estes termos para info@cinagroup.com.'] },
      ],
    },
  },
  fr: {
    privacy: {
      title: 'Politique de confidentialité',
      description: 'Comment CinaGroup traite les informations sur son site public et dans son formulaire de contact.',
      updated: 'Dernière mise à jour : 31 août 2026',
      noticeTitle: 'Avis important concernant la traduction',
      notice:
        'Cette version française est fournie à titre pratique et n’a pas encore été vérifiée par un professionnel du droit local. En cas de divergence avec la version anglaise, la version anglaise prévaut dans la mesure permise par la loi applicable.',
      englishLink: 'Lire la version officielle en anglais',
      intro:
        'Cette politique explique comment CinaGroup traite les informations lorsque vous consultez cinagroup.com ou utilisez les moyens de contact publiés sur le site.',
      sections: [
        {
          heading: 'Résumé',
          paragraphs: ['Vous pouvez consulter les pages publiques sans créer de compte pour le site.'],
          bullets: [
            'Les données du formulaire sont envoyées à un endpoint CinaGroup et les demandes acceptées sont conservées dans Cloudflare D1.',
            'Les prestataires d’hébergement et de sécurité peuvent traiter les données techniques usuelles pour livrer et protéger le site.',
            'Les sites externes appliquent leurs propres politiques.',
          ],
        },
        {
          heading: 'Informations que vous fournissez',
          paragraphs: [
            'Lors de l’envoi, nous conservons la référence et l’heure, la date de suppression prévue, la langue, le nom, l’email, l’entreprise facultative, la catégorie et le message, les états opérationnel et de notification, ainsi que le hostname récepteur.',
            'La base des demandes ne conserve pas intentionnellement l’adresse IP ni le user agent. Cloudflare peut traiter séparément des données techniques pour protéger le réseau ; un email direct comporte les métadonnées habituelles.',
            'N’envoyez pas de mots de passe, clés API, données de carte, identifiants officiels, données de santé ou autres informations sensibles.',
          ],
        },
        {
          heading: 'Données techniques et stockage',
          paragraphs: [
            'Pour livrer le site, rechercher des erreurs, empêcher les abus et maintenir sa fiabilité, les systèmes peuvent traiter IP, heure, page, appareil ou navigateur, référent et signaux de sécurité.',
            'Aucun profil publicitaire n’est requis. Les prestataires peuvent utiliser un stockage essentiel pour la sécurité, le trafic et les fonctions de base.',
          ],
        },
        {
          heading: 'Finalités',
          paragraphs: [
            'Nous utilisons les informations pour répondre, évaluer les travaux, exploiter, protéger et améliorer le site, prévenir fraude et abus, respecter la loi et gérer les réclamations.',
          ],
        },
        {
          heading: 'Partage et traitement international',
          paragraphs: [
            'Cloudflare fournit Pages, Workers, la protection réseau et D1 et peut traiter les informations dans plusieurs pays. Aucun webhook de notification facultatif n’est actuellement configuré ; si nous l’activons, nous choisirons un prestataire adapté et mettrons cet avis à jour.',
            'Nous pouvons partager avec des prestataires opérationnels, en vertu de la loi, pour protéger des droits ou la sécurité, ou lors d’une réorganisation assortie de garanties. Nous ne présentons pas les données personnelles comme vendues par ce site.',
          ],
        },
        {
          heading: 'Conservation',
          paragraphs: [
            'Les demandes sont normalement programmées pour suppression 12 mois après acceptation. Nous pouvons supprimer plus tôt lorsqu’elles ne sont plus utiles ou sur demande vérifiée, ou conserver plus longtemps pour la loi, un litige, la prévention des abus ou des dossiers contractuels.',
          ],
        },
        {
          heading: 'Vos choix et droits',
          paragraphs: [
            'Selon votre résidence, vous pouvez disposer de droits d’accès, rectification, effacement, limitation, opposition, portabilité ou retrait du consentement, sous réserve d’exceptions. Écrivez à info@cinagroup.com et indiquez la référence si vous la connaissez. Une vérification appropriée peut être demandée.',
          ],
        },
        {
          heading: 'Mineurs, sites externes et modifications',
          paragraphs: [
            'Le site vise les entreprises et le grand public, pas les enfants. Les sites externes suivent les politiques de leurs prestataires. Si la politique change, nous actualiserons la date en haut.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: ['Adressez vos questions ou demandes de confidentialité à info@cinagroup.com.'],
        },
      ],
    },
    terms: {
      title: 'Conditions d’utilisation',
      description: 'Conditions applicables à l’utilisation du site public de CinaGroup.',
      updated: 'Dernière mise à jour : 4 août 2026',
      noticeTitle: 'Avis important concernant la traduction',
      notice:
        'Cette version française est fournie à titre pratique et n’a pas encore été vérifiée par un professionnel du droit local. En cas de divergence avec la version anglaise, la version anglaise prévaut dans la mesure permise par la loi applicable.',
      englishLink: 'Lire la version officielle en anglais',
      intro:
        'Ces conditions s’appliquent au site public cinagroup.com. Les sites produits, comptes, services payants, dépôts ou projets distincts peuvent avoir des conditions supplémentaires.',
      sections: [
        {
          heading: 'Acceptation',
          paragraphs: [
            'En accédant au site ou en l’utilisant, vous acceptez ces conditions. Si vous refusez, n’utilisez pas le site.',
          ],
        },
        {
          heading: 'Objet du site et conditions commerciales',
          paragraphs: [
            'Le site fournit des informations générales sur CinaGroup, ses produits, services et publications. Il ne constitue ni offre ferme, ni SLA, ni garantie de disponibilité, ni promesse de fonction dans chaque région ou formule.',
            'Les travaux, prix, livrables, licences, support et critères d’acceptation précis doivent figurer dans la commande, le contrat, les conditions produit ou la confirmation écrite applicable.',
          ],
        },
        {
          heading: 'Utilisation autorisée',
          paragraphs: ['Vous pouvez consulter et lier le site à des fins licites. Il est interdit de :'],
          bullets: [
            'perturber le site, l’infrastructure ou les utilisateurs',
            'tenter un accès non autorisé aux systèmes, comptes ou données',
            'introduire malware, trafic abusif ou automatisation excessive',
            'présenter faussement son identité ou son affiliation',
            'enfreindre la loi ou les droits d’autrui',
            'copier ou exploiter un contenu protégé au-delà des autorisations',
          ],
        },
        {
          heading: 'Propriété intellectuelle',
          paragraphs: [
            'Sauf indication contraire, design, marques, textes originaux et autres contenus appartiennent ou sont concédés à CinaGroup. Les droits des tiers restent à leurs titulaires. La licence d’un dépôt public n’accorde pas automatiquement de droits sur les marques ou services distincts.',
          ],
        },
        {
          heading: 'Liens et communications',
          paragraphs: [
            'Nous ne contrôlons pas tous les sites externes et ne répondons pas de leur contenu, disponibilité, sécurité ou confidentialité ; un lien ne vaut pas approbation. Vous êtes responsable des informations envoyées. Une demande ne crée pas à elle seule une relation confidentielle, fiduciaire, de travail, de partenariat ou de clientèle.',
          ],
        },
        {
          heading: 'Disponibilité et exclusions',
          paragraphs: [
            'Nous pouvons modifier, suspendre ou retirer contenu ou fonctions et ne garantissons ni exhaustivité, ni continuité, ni exactitude, ni absence d’erreur. Dans la mesure légale, le site est fourni « en l’état » et « selon disponibilité » et ne constitue pas un conseil juridique, financier, de sécurité ou autre conseil réglementé. Certaines exclusions peuvent être inapplicables localement.',
          ],
        },
        {
          heading: 'Limitation de responsabilité et indemnisation',
          paragraphs: [
            'Dans la mesure légale, CinaGroup et ses contributeurs ne répondent pas des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs ni des pertes de bénéfice, chiffre d’affaires, données, réputation ou opportunité. Nous n’excluons pas une responsabilité que la loi interdit d’exclure. Lorsque permis, vous répondez des pertes dues à un usage illicite ou à une violation.',
          ],
        },
        {
          heading: 'Modifications et dispositions générales',
          paragraphs: [
            'Nous pouvons actualiser les conditions. Sauf notification imposée par la loi, la nouvelle version s’applique dès publication. L’inapplicabilité d’une clause n’affecte pas les autres ; l’absence d’exercice d’un droit n’est pas une renonciation. Ces conditions ne remplacent pas un accord écrit distinct.',
          ],
        },
        { heading: 'Contact', paragraphs: ['Adressez vos questions sur ces conditions à info@cinagroup.com.'] },
      ],
    },
  },
};
