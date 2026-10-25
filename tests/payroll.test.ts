import { describe, it, expect } from "vitest";
import { calculatePayroll, recoveryInstallment } from "../lib/payroll";
describe("payroll accounting", () => {
  it("calculates the specified unpaid absence example exactly once", () => {
    expect(
      calculatePayroll({ salary: 300, divisor: 26, unpaidDays: 2 }),
    ).toMatchObject({
      unpaidAbsence: "23.08",
      basic: "276.92",
      net: "276.92",
      deductions: "0.00",
    });
  });
  it("preserves full paid leave earnings", () => {
    expect(
      calculatePayroll({ salary: 300, divisor: 26, unpaidDays: 0 }).net,
    ).toBe("300.00");
  });
  it("calculates approved overtime and allowances", () => {
    expect(
      calculatePayroll({
        salary: 260,
        divisor: 26,
        unpaidDays: 0,
        overtimeHours: 8,
        multiplier: 1.5,
        allowances: 20,
        bonuses: 10,
      }),
    ).toMatchObject({ overtime: "15.00", gross: "305.00", net: "305.00" });
  });
  it("reconciles deductions and partial payments", () => {
    expect(
      calculatePayroll({
        salary: 300,
        divisor: 26,
        unpaidDays: 0,
        late: 5,
        advance: 25,
        damage: 10,
        other: 2,
        paid: 100,
      }),
    ).toMatchObject({
      deductions: "42.00",
      net: "258.00",
      paid: "100.00",
      remaining: "158.00",
    });
  });
  it("prorates basic pay for a partial period", () => {
    expect(
      calculatePayroll({
        salary: 300,
        divisor: 26,
        unpaidDays: 1,
        employmentRatio: 0.5,
      }).basic,
    ).toBe("138.46");
  });
  it("uses decimal half-up rounding", () => {
    expect(
      calculatePayroll({ salary: "100.005", divisor: 1, unpaidDays: 0 }).basic,
    ).toBe("100.01");
  });
  it("rejects overpayments", () => {
    expect(() =>
      calculatePayroll({ salary: 100, divisor: 26, unpaidDays: 0, paid: 101 }),
    ).toThrow("Payments exceed");
  });
  it("rejects deductions above earnings", () => {
    expect(() =>
      calculatePayroll({
        salary: 100,
        divisor: 26,
        unpaidDays: 0,
        advance: 101,
      }),
    ).toThrow("Deductions exceed");
  });
  it("rejects negative input and zero divisor", () => {
    expect(() =>
      calculatePayroll({ salary: -1, divisor: 26, unpaidDays: 0 }),
    ).toThrow();
    expect(() =>
      calculatePayroll({ salary: 100, divisor: 0, unpaidDays: 0 }),
    ).toThrow();
  });
  it("caps installment at remaining advance or damage balance", () => {
    expect(recoveryInstallment(100, 0, 25)).toBe("25.00");
    expect(recoveryInstallment(100, 90, 25)).toBe("10.00");
  });
  it("rejects over-recovered balances", () => {
    expect(() => recoveryInstallment(100, 101, 25)).toThrow();
  });
});
