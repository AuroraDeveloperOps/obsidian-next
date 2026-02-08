import cronParser from 'cron-parser';

const cron = '56 11 * * *';
const baseline = new Date('2026-02-02T11:56:00.000Z').getTime();
const parse = (cronParser as any).parseExpression || (cronParser as any).default?.parseExpression || (cronParser as any).parse;
const interval = parse(cron, { currentDate: baseline });

console.log('Baseline:', new Date(baseline).toISOString());
console.log('Next 1:', interval.next().toISOString());
console.log('Next 2:', interval.next().toISOString());
