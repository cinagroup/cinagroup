export type EvidenceTier = 'repository' | 'commit' | 'test' | 'deployment' | 'customer-approved-case';

export type NonEmptyList<T> = readonly [T, ...T[]];

export interface EvidenceReference {
  tier: EvidenceTier;
  label: string;
  href: string;
  verifiedAt: string;
}

export interface ApprovedAttribution {
  organization: string;
  displayName: string;
  approval: {
    approvedBy: string;
    approvedAt: string;
    scope: string;
  };
}

export interface OutcomeMetric {
  label: string;
  value: string;
  methodology: string;
  measurementWindow: string;
  evidence: NonEmptyList<EvidenceReference>;
  limitations: string;
}

export interface PublicCaseStudy {
  status: 'public';
  slug: string;
  title: string;
  summary: string;
  attribution: ApprovedAttribution;
  evidence: NonEmptyList<EvidenceReference>;
  methodology: string;
  measurementWindow: string;
  limitations: string;
  metrics?: NonEmptyList<OutcomeMetric>;
}

export interface NonPublicCaseStudy {
  status: 'draft' | 'private' | 'withdrawn';
  title: string;
  internalNote: string;
}

export type CaseStudy = PublicCaseStudy | NonPublicCaseStudy;

/**
 * This template is deliberately not part of `caseStudies` and is never routed or rendered.
 * It describes the minimum fields an editor must replace with approved, attributable evidence.
 */
export const illustrativeCaseTemplate: NonPublicCaseStudy = {
  status: 'draft',
  title: 'Illustrative case record — not a customer case',
  internalNote:
    'Replace this template with an approved attribution, linked evidence, a measurement method, a window, and limitations before changing status to public.',
};

// No customer has approved a public case study yet. Keep this list empty until every
// `public` record satisfies both the type contract and the runtime audit below.
export const caseStudies: readonly CaseStudy[] = [];

const isNonEmptyText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isIsoDate = (value: unknown): value is string => {
  if (!isNonEmptyText(value) || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const normalized = new Date(timestamp).toISOString();
  if (value.length === 10) return normalized.slice(0, 10) === value;
  return value.includes('.') ? normalized === value : normalized.replace('.000Z', 'Z') === value;
};
const isFutureDate = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp > Date.now();
};
const isHttpsUrl = (value: unknown): value is string => {
  if (!isNonEmptyText(value)) return false;

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const validateEvidence = (evidence: unknown, path: string): string[] => {
  if (!Array.isArray(evidence) || evidence.length === 0) return [`${path} must contain at least one evidence link`];

  return evidence.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [`${path}[${index}] must be an evidence object`];

    const candidate = item as Partial<EvidenceReference>;
    const failures: string[] = [];
    if (!['repository', 'commit', 'test', 'deployment', 'customer-approved-case'].includes(candidate.tier ?? '')) {
      failures.push(`${path}[${index}].tier is invalid`);
    }
    if (!isNonEmptyText(candidate.label)) failures.push(`${path}[${index}].label is required`);
    if (!isHttpsUrl(candidate.href)) failures.push(`${path}[${index}].href must be an HTTPS URL`);
    if (!isIsoDate(candidate.verifiedAt)) failures.push(`${path}[${index}].verifiedAt must be an ISO date`);
    else if (isFutureDate(candidate.verifiedAt)) {
      failures.push(`${path}[${index}].verifiedAt cannot be in the future`);
    }
    return failures;
  });
};

export const validatePublicCaseStudy = (candidate: unknown): string[] => {
  if (!candidate || typeof candidate !== 'object') return ['case must be an object'];

  const item = candidate as Partial<PublicCaseStudy>;
  if (item.status !== 'public') return ['status must be public'];

  const failures: string[] = [];
  for (const key of ['slug', 'title', 'summary', 'methodology', 'measurementWindow', 'limitations'] as const) {
    if (!isNonEmptyText(item[key])) failures.push(`${key} is required`);
  }
  if (isNonEmptyText(item.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) {
    failures.push('slug must be lowercase kebab-case');
  }

  if (!item.attribution || typeof item.attribution !== 'object') {
    failures.push('attribution is required');
  } else {
    if (!isNonEmptyText(item.attribution.organization)) failures.push('attribution.organization is required');
    if (!isNonEmptyText(item.attribution.displayName)) failures.push('attribution.displayName is required');
    if (!item.attribution.approval || typeof item.attribution.approval !== 'object') {
      failures.push('attribution.approval is required');
    } else {
      if (!isNonEmptyText(item.attribution.approval.approvedBy)) {
        failures.push('attribution.approval.approvedBy is required');
      }
      if (!isIsoDate(item.attribution.approval.approvedAt)) {
        failures.push('attribution.approval.approvedAt must be an ISO date');
      } else if (isFutureDate(item.attribution.approval.approvedAt)) {
        failures.push('attribution.approval.approvedAt cannot be in the future');
      }
      if (!isNonEmptyText(item.attribution.approval.scope)) failures.push('attribution.approval.scope is required');
    }
  }

  failures.push(...validateEvidence(item.evidence, 'evidence'));
  if (Array.isArray(item.evidence) && !item.evidence.some((evidence) => evidence?.tier === 'customer-approved-case')) {
    failures.push('evidence must include a customer-approved-case approval record');
  }

  if (item.metrics !== undefined) {
    if (!Array.isArray(item.metrics) || item.metrics.length === 0) {
      failures.push('metrics must be omitted or contain at least one metric');
    } else {
      item.metrics.forEach((metric, index) => {
        for (const key of ['label', 'value', 'methodology', 'measurementWindow', 'limitations'] as const) {
          if (!isNonEmptyText(metric?.[key])) failures.push(`metrics[${index}].${key} is required`);
        }
        failures.push(...validateEvidence(metric?.evidence, `metrics[${index}].evidence`));
      });
    }
  }

  return failures;
};

export const isPublishableCaseStudy = (candidate: CaseStudy): candidate is PublicCaseStudy =>
  candidate.status === 'public' && validatePublicCaseStudy(candidate).length === 0;

export const publicCaseStudies: readonly PublicCaseStudy[] = caseStudies.filter(isPublishableCaseStudy);
