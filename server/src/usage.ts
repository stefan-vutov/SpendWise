import fs from 'node:fs';
import path from 'node:path';
import { PRO_PLAN } from './plans.js';

/**
 * Per-subscriber monthly usage. Stored in a JSON file, which is fine for a first launch on a
 * server with a persistent disk. Move this to a database (e.g. Postgres/Redis) before scaling out
 * to several server instances.
 */
export interface MonthUsage {
  month: string; // "2026-11"
  priceChecks: number;
  priceCheckCostUsd: number;
  assessCostUsd: number;
}

export interface UsageSummary {
  month: string;
  priceChecksUsed: number;
  priceChecksLimit: number;
  priceChecksLeft: number;
  resetsAt: string;
}

const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');
const FILE = path.join(DATA_DIR, 'usage.json');

const currentMonth = (now = new Date()) => now.toISOString().slice(0, 7);

export class UsageStore {
  private data: Record<string, MonthUsage> = {};
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private file: string | null = FILE) {
    if (file && fs.existsSync(file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        console.error('usage.json unreadable — starting fresh');
      }
    }
  }

  get(userId: string, now = new Date()): MonthUsage {
    const month = currentMonth(now);
    const u = this.data[userId];
    if (!u || u.month !== month) {
      this.data[userId] = { month, priceChecks: 0, priceCheckCostUsd: 0, assessCostUsd: 0 };
    }
    return this.data[userId];
  }

  priceChecksLeft(userId: string, now = new Date()): number {
    const u = this.get(userId, now);
    if (u.priceCheckCostUsd >= PRO_PLAN.monthlyPriceCheckCostCapUsd) return 0;
    return Math.max(0, PRO_PLAN.monthlyPriceChecks - u.priceChecks);
  }

  /** Claim one check before running it, so parallel requests can't overshoot the limit. */
  reservePriceCheck(userId: string): boolean {
    if (this.priceChecksLeft(userId) <= 0) return false;
    this.get(userId).priceChecks += 1;
    this.save();
    return true;
  }

  releasePriceCheck(userId: string) {
    const u = this.get(userId);
    u.priceChecks = Math.max(0, u.priceChecks - 1);
    this.save();
  }

  addPriceCheckCost(userId: string, usd: number) {
    this.get(userId).priceCheckCostUsd += usd;
    this.save();
  }

  canAssess(userId: string): boolean {
    return this.get(userId).assessCostUsd < PRO_PLAN.monthlyAssessCostCapUsd;
  }

  addAssessCost(userId: string, usd: number) {
    this.get(userId).assessCostUsd += usd;
    this.save();
  }

  summary(userId: string, now = new Date()): UsageSummary {
    const u = this.get(userId, now);
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return {
      month: u.month,
      priceChecksUsed: u.priceChecks,
      priceChecksLimit: PRO_PLAN.monthlyPriceChecks,
      priceChecksLeft: this.priceChecksLeft(userId, now),
      resetsAt: next.toISOString(),
    };
  }

  private save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      fs.mkdirSync(path.dirname(this.file!), { recursive: true });
      fs.writeFileSync(this.file!, JSON.stringify(this.data));
    }, 500);
  }
}
