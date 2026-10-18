import { z } from 'zod';
import type { TransitDataset, TransitDisruptionDraft } from '../../shared/transit.js';
import { HttpError } from '../errors.js';
import { instantSchema } from '../validation.js';

export const transitDisruptionSchema = z.object({
  routeId: z.string().min(1).max(160), directionId: z.string().max(30).optional(),
  fromStopId: z.string().max(160).optional(), toStopId: z.string().max(160).optional(),
  title: z.string().trim().min(1).max(160), description: z.string().trim().max(1000),
  startsAt: instantSchema, endsAt: instantSchema, status: z.enum(['published', 'cancelled']),
  sourceUrl: z.string().url().max(1500).refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must follow start.' });
  if (!!value.fromStopId !== !!value.toStopId) context.addIssue({ code: 'custom', path: ['fromStopId'], message: 'Choose both segment endpoints or neither.' });
});
export const transitDisruptionUpdateSchema = z.object({ ...transitDisruptionSchema.shape, revision: z.number().int().positive() }).strict().superRefine((value, context) => {
  const { revision: _revision, ...draft } = value, result = transitDisruptionSchema.safeParse(draft);
  if (!result.success) for (const issue of result.error.issues) context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});

/** One validation boundary for manual notices and administrator-reviewed agent work. */
export function assertTransitDisruptionScope(data: TransitDataset | null, draft: TransitDisruptionDraft) {
  if (!data) throw new HttpError(503, 'Load public bus data before publishing a service notice.');
  if (!data.routes.some(route => route.id === draft.routeId)) throw new HttpError(400, 'Choose a known bus route.');
  const patterns = data.patterns.filter(pattern => pattern.routeId === draft.routeId && (draft.directionId === undefined || pattern.directionId === draft.directionId));
  if (draft.directionId !== undefined && !patterns.length) throw new HttpError(400, 'Choose a known direction.');
  if (draft.fromStopId && !patterns.some(pattern => pattern.stopIds.indexOf(draft.fromStopId!) >= 0 && pattern.stopIds.indexOf(draft.toStopId!) > pattern.stopIds.indexOf(draft.fromStopId!)))
    throw new HttpError(400, 'Select ordered stops from one route direction.');
}
