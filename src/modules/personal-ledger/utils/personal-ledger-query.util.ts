import { PipelineStage, Types } from 'mongoose';
import { ListPersonalLedgerMovementsQueryDto } from '../dto/request/list-personal-ledger-movements-query.dto';

export function ledgerSearchExpression(text: string): RegExp {
  return new RegExp(text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function ledgerMovementFilter(query: ListPersonalLedgerMovementsQueryDto): PipelineStage[] {
  const match: Record<string, unknown> = { isDeleted: false };
  if (query.contactId) match.contactId = new Types.ObjectId(query.contactId);
  if (query.from || query.to)
    match.movementDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'personalledgercontacts', localField: 'contactId', foreignField: '_id', as: 'contact' } },
    { $set: { contactName: { $arrayElemAt: ['$contact.name', 0] } } },
    { $unset: 'contact' },
  ];
  if (query.q?.trim()) {
    const expression = ledgerSearchExpression(query.q);
    pipeline.push({ $match: { $or: [{ contactName: expression }, { notes: expression }] } });
  }
  return pipeline;
}

export function ledgerSummaryStages(): PipelineStage.Group[] {
  return [
    {
      $group: {
        _id: null,
        deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } },
        count: { $sum: 1 },
      },
    },
  ];
}
