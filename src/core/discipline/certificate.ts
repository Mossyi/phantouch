export type CertificateThemeId = 'transformation' | 'etiquette' | 'discipline' | 'story';
export type CertificateTermId = '30d' | '90d' | '365d' | 'lasting';
export type CertificateReviewId = '7d' | '30d' | '90d';

export interface CertificateOption<T extends string> {
  id: T;
  title: string;
  description: string;
}

export interface CertificateClause {
  id: string;
  text: string;
  required?: boolean;
}

export interface SignedCertificateRecord {
  version: 1;
  id: string;
  signedAt: string;
  participantName: string;
  mentorId: string;
  mentorName: string;
  themeId: CertificateThemeId;
  themeTitle: string;
  termId: CertificateTermId;
  termTitle: string;
  reviewId: CertificateReviewId;
  reviewTitle: string;
  clauses: string[];
  customPromise: string;
  signatureDataUrl: string;
}

export const CERTIFICATE_STORAGE_KEY = 'ycy_lifetime_certificate_v2';

export const CERTIFICATE_THEMES: Array<CertificateOption<CertificateThemeId>> = [
  { id: 'transformation', title: '蜕变成长', description: '围绕表达、形象与自我认同记录长期变化。' },
  { id: 'etiquette', title: '仪态养成', description: '把姿态、声线、穿搭与日常礼仪拆成可复盘目标。' },
  { id: 'discipline', title: '自律陪伴', description: '由导师提供提醒与阶段目标，但每次变更仍由本人确认。' },
  { id: 'story', title: '角色剧情', description: '把契约作为角色扮演世界观的一部分，不影响现实权利。' },
];

export const CERTIFICATE_TERMS: Array<CertificateOption<CertificateTermId>> = [
  { id: '30d', title: '30 天', description: '短期体验' },
  { id: '90d', title: '90 天', description: '阶段养成' },
  { id: '365d', title: '365 天', description: '年度计划' },
  { id: 'lasting', title: '长期纪念', description: '可随时撤销' },
];

export const CERTIFICATE_REVIEWS: Array<CertificateOption<CertificateReviewId>> = [
  { id: '7d', title: '每 7 天', description: '高频调整' },
  { id: '30d', title: '每 30 天', description: '月度复盘' },
  { id: '90d', title: '每 90 天', description: '季度复盘' },
];

export const CERTIFICATE_CLAUSES: CertificateClause[] = [
  { id: 'voluntary', required: true, text: '本契约完全自愿，参与者可以随时暂停、修改或撤销，停止不构成失败或违约。' },
  { id: 'safety', required: true, text: '任何设备动作都必须服从全局安全上限、急停锁和本次明确授权；契约本身不授予硬件控制权。' },
  { id: 'privacy', required: true, text: '姓名、签名、复盘与契约内容默认只保存在本设备，不自动上传或公开分享。' },
  { id: 'goals', text: '导师可以提出阶段目标和日常提醒，但新增目标、提高难度或改变边界需要参与者再次确认。' },
  { id: 'review', text: '双方按所选周期复盘体验，保留有效内容，并删除不再适合的约定。' },
  { id: 'fiction', text: '角色称呼、归属和“终身”均属于自愿剧情设定，不构成现实法律、财产、人身或医疗关系。' },
];

const clean = (value: unknown, maximum: number): string => typeof value === 'string' ? value.trim().slice(0, maximum) : '';

const optionById = <T extends string>(options: Array<CertificateOption<T>>, id: unknown): CertificateOption<T> | null => (
  typeof id === 'string' ? options.find((option) => option.id === id) || null : null
);

export const createSignedCertificateRecord = (input: {
  participantName: string;
  mentorId: string;
  mentorName: string;
  themeId: CertificateThemeId;
  termId: CertificateTermId;
  reviewId: CertificateReviewId;
  clauseIds: string[];
  customPromise?: string;
  signatureDataUrl: string;
}, now = new Date(), random = Math.random): SignedCertificateRecord => {
  const theme = optionById(CERTIFICATE_THEMES, input.themeId) || CERTIFICATE_THEMES[0];
  const term = optionById(CERTIFICATE_TERMS, input.termId) || CERTIFICATE_TERMS[0];
  const review = optionById(CERTIFICATE_REVIEWS, input.reviewId) || CERTIFICATE_REVIEWS[0];
  const selected = new Set(input.clauseIds);
  const clauses = CERTIFICATE_CLAUSES.filter((clause) => clause.required || selected.has(clause.id)).map((clause) => clause.text);
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(Math.max(0, Math.min(0.999999, random())) * 0xffffff).toString(16).padStart(6, '0').toUpperCase();

  return {
    version: 1,
    id: `YCY-${datePart}-${randomPart}`,
    signedAt: now.toISOString(),
    participantName: clean(input.participantName, 60) || '未命名参与者',
    mentorId: clean(input.mentorId, 80),
    mentorName: clean(input.mentorName, 80) || '未命名导师',
    themeId: theme.id,
    themeTitle: theme.title,
    termId: term.id,
    termTitle: term.title,
    reviewId: review.id,
    reviewTitle: review.title,
    clauses,
    customPromise: clean(input.customPromise, 300),
    signatureDataUrl: input.signatureDataUrl.startsWith('data:image/png;base64,') ? input.signatureDataUrl.slice(0, 1_500_000) : '',
  };
};

export const normalizeSignedCertificateRecord = (value: unknown): SignedCertificateRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SignedCertificateRecord>;
  const theme = optionById(CERTIFICATE_THEMES, raw.themeId);
  const term = optionById(CERTIFICATE_TERMS, raw.termId);
  const review = optionById(CERTIFICATE_REVIEWS, raw.reviewId);
  const participantName = clean(raw.participantName, 60);
  const mentorName = clean(raw.mentorName, 80);
  const signatureDataUrl = clean(raw.signatureDataUrl, 1_500_000);
  const signedAt = clean(raw.signedAt, 40);
  if (raw.version !== 1 || !theme || !term || !review || !participantName || !mentorName || !signatureDataUrl.startsWith('data:image/png;base64,') || Number.isNaN(Date.parse(signedAt))) return null;
  const clauses = Array.isArray(raw.clauses) ? raw.clauses.map((clause) => clean(clause, 300)).filter(Boolean).slice(0, 10) : [];
  if (clauses.length < CERTIFICATE_CLAUSES.filter((clause) => clause.required).length) return null;
  return {
    version: 1,
    id: clean(raw.id, 80) || `YCY-${signedAt.slice(0, 10).replace(/-/g, '')}-RESTORED`,
    signedAt,
    participantName,
    mentorId: clean(raw.mentorId, 80),
    mentorName,
    themeId: theme.id,
    themeTitle: theme.title,
    termId: term.id,
    termTitle: term.title,
    reviewId: review.id,
    reviewTitle: review.title,
    clauses,
    customPromise: clean(raw.customPromise, 300),
    signatureDataUrl,
  };
};
