import type { PipelineStage } from 'mongoose';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';
import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';

function mongoLineVolumeM3Expr(): Record<string, unknown> {
  return {
    $round: [
      {
        $multiply: ['$lines.thickness', '$lines.width', '$lines.length'],
      },
      6,
    ],
  };
}

function mongoLineIsCubicExpr(): Record<string, unknown> {
  return {
    $eq: [
      {
        $ifNull: [
          '$lines.pricingModeSnapshot',
          {
            $cond: [
              {
                $and: [
                  { $ne: ['$lines.width', null] },
                  { $ne: ['$lines.length', null] },
                  { $ne: ['$lines.thickness', null] },
                ],
              },
              PricingMode.PER_CUBIC_METER,
              PricingMode.PER_PIECE,
            ],
          },
        ],
      },
      PricingMode.PER_CUBIC_METER,
    ],
  };
}

export function buildSalesHeaderPipeline(from: Date, to: Date): PipelineStage[] {
  const invoiceFilter = { status: SalesInvoiceStatus.SAVED, createdAt: { $gte: from, $lt: to } };
  return [
    { $match: invoiceFilter },
    {
      $group: {
        _id: null,
        totalSum: { $sum: '$total' },
        discountSum: { $sum: '$discount' },
        invoiceCount: { $sum: 1 },
      },
    },
  ];
}

export function buildSalesCogsPipeline(from: Date, to: Date): PipelineStage[] {
  const invoiceFilter = { status: SalesInvoiceStatus.SAVED, createdAt: { $gte: from, $lt: to } };
  return [
    { $match: invoiceFilter },
    { $unwind: '$lines' },
    {
      $project: {
        lineCogs: {
          $cond: [
            mongoLineIsCubicExpr(),
            {
              $multiply: ['$lines.quantity', mongoLineVolumeM3Expr(), '$lines.costPriceSnapshot'],
            },
            {
              $multiply: ['$lines.quantity', '$lines.costPriceSnapshot'],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        cogsSum: { $sum: '$lineCogs' },
      },
    },
  ];
}

export function buildCollectedPipeline(from: Date, to: Date): PipelineStage[] {
  return [
    {
      $match: {
        reversedAt: null,
        createdAt: { $gte: from, $lt: to },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
      },
    },
  ];
}

export function buildDebtPipeline(): PipelineStage[] {
  return [
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalDebt: { $sum: '$balance' },
        debtorCount: {
          $sum: {
            $cond: [{ $gt: ['$balance', 0] }, 1, 0],
          },
        },
      },
    },
  ];
}

export function buildTopSellingItemsPipeline(from: Date, to: Date): PipelineStage[] {
  return [
    {
      $match: {
        status: SalesInvoiceStatus.SAVED,
        createdAt: { $gte: from, $lt: to },
      },
    },
    { $unwind: '$lines' },
    {
      $project: {
        itemId: { $toString: '$lines.itemId' },
        revenue: '$lines.lineTotal',
        quantity: {
          $cond: [
            mongoLineIsCubicExpr(),
            // Matches stockDeltaForLine: round(qty × volume, 6)
            {
              $round: [{ $multiply: ['$lines.quantity', mongoLineVolumeM3Expr()] }, 6],
            },
            '$lines.quantity',
          ],
        },
      },
    },
    {
      $group: {
        _id: '$itemId',
        revenue: { $sum: '$revenue' },
        quantity: { $sum: '$quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ];
}
