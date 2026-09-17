/**
 * Tea break eligibility: first check-in must be before allowance end (startedAt + 10 min).
 */
const {
  isEmployeeEligibleForTeaBreakByFirstCheckIn,
  getTeaBreakAllowanceEnd,
  TEA_BREAK_DURATION_MS,
} = require('../teaBreakService');

const breakStart = new Date('2026-07-20T10:00:00+05:30');
const allowanceEnd = getTeaBreakAllowanceEnd(breakStart);

describe('tea break eligibility', () => {
  test('allowance end is 10 minutes after break start', () => {
    expect(allowanceEnd.getTime()).toBe(breakStart.getTime() + TEA_BREAK_DURATION_MS);
  });

  test('check-in before break is eligible', () => {
    expect(
      isEmployeeEligibleForTeaBreakByFirstCheckIn(
        new Date('2026-07-20T09:50:00+05:30'),
        breakStart
      )
    ).toBe(true);
  });

  test('check-in during break window is eligible', () => {
    expect(
      isEmployeeEligibleForTeaBreakByFirstCheckIn(
        new Date('2026-07-20T10:05:00+05:30'),
        breakStart
      )
    ).toBe(true);
  });

  test('check-in at allowance end is not eligible', () => {
    expect(isEmployeeEligibleForTeaBreakByFirstCheckIn(allowanceEnd, breakStart)).toBe(false);
  });

  test('check-in after allowance is not eligible', () => {
    expect(
      isEmployeeEligibleForTeaBreakByFirstCheckIn(
        new Date('2026-07-20T10:12:00+05:30'),
        breakStart
      )
    ).toBe(false);
  });

  test('missing check-in is not eligible', () => {
    expect(isEmployeeEligibleForTeaBreakByFirstCheckIn(null, breakStart)).toBe(false);
  });
});
