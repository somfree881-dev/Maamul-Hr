import Decimal from "decimal.js";
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export type Money = Decimal.Value;
const money = (v: Money) => new Decimal(v).toDecimalPlaces(2);
export function calculatePayroll(i: {
  salary: Money;
  divisor: Money;
  unpaidDays: Money;
  employmentRatio?: Money;
  overtimeHours?: Money;
  hoursPerDay?: Money;
  multiplier?: Money;
  bonuses?: Money;
  allowances?: Money;
  late?: Money;
  advance?: Money;
  damage?: Money;
  other?: Money;
  paid?: Money;
}) {
  const values = Object.values(i);
  if (
    values.some(
      (x) => !new Decimal(x).isFinite() || new Decimal(x).isNegative(),
    )
  )
    throw new Error("Invalid negative or non-finite input");
  if (new Decimal(i.divisor).lte(0) || new Decimal(i.hoursPerDay ?? 8).lte(0))
    throw new Error("Divisor must be positive");
  const ratio = new Decimal(i.employmentRatio ?? 1);
  if (ratio.gt(1)) throw new Error("Invalid proration");
  const prorated = money(new Decimal(i.salary).mul(ratio));
  const unpaid = Decimal.min(
    prorated,
    money(new Decimal(i.salary).div(i.divisor).mul(i.unpaidDays)),
  );
  const basic = prorated.minus(unpaid);
  const overtime = money(
    new Decimal(i.salary)
      .div(i.divisor)
      .div(i.hoursPerDay ?? 8)
      .mul(i.overtimeHours ?? 0)
      .mul(i.multiplier ?? 1.5),
  );
  const gross = money(
    basic
      .plus(overtime)
      .plus(i.bonuses ?? 0)
      .plus(i.allowances ?? 0),
  );
  const deductions = money(
    new Decimal(i.late ?? 0)
      .plus(i.advance ?? 0)
      .plus(i.damage ?? 0)
      .plus(i.other ?? 0),
  );
  const net = gross.minus(deductions);
  if (net.lt(0)) throw new Error("Deductions exceed earnings");
  const paid = money(i.paid ?? 0);
  if (paid.gt(net)) throw new Error("Payments exceed net salary");
  return {
    basic: basic.toFixed(2),
    unpaidAbsence: unpaid.toFixed(2),
    overtime: overtime.toFixed(2),
    gross: gross.toFixed(2),
    deductions: deductions.toFixed(2),
    net: net.toFixed(2),
    paid: paid.toFixed(2),
    remaining: net.minus(paid).toFixed(2),
  };
}
export function recoveryInstallment(
  amount: Money,
  recovered: Money,
  due: Money,
) {
  if ([amount, recovered, due].some((x) => new Decimal(x).isNegative()))
    throw new Error("Negative recovery");
  if (new Decimal(recovered).gt(amount)) throw new Error("Over-recovery");
  return money(
    Decimal.min(new Decimal(amount).minus(recovered), new Decimal(due)),
  ).toFixed(2);
}
