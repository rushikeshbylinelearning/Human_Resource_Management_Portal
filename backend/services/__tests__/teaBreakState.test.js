/**
 * Durable tea-break ended-state: TeaBreakReturn is source of truth;
 * in-memory Map is a cache that hydrates from DB.
 */
jest.mock('../../models/TeaBreakReturn', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

const TeaBreakReturn = require('../../models/TeaBreakReturn');
const {
  markTeaBreakEnded,
  hasTeaBreakEnded,
  hasEmployeeEndedTeaBreak,
  loadEndedEmployeeIdsFromDb,
  hydrateEndedStateFromDb,
  clearTeaBreakState,
} = require('../teaBreakState');

const ANN = 'ann-1';
const USER_A = 'user-a';
const USER_B = 'user-b';

function mockFindOneHit() {
  TeaBreakReturn.findOne.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve({ _id: 'row-1' }),
    }),
  });
}

function mockFindOneMiss() {
  TeaBreakReturn.findOne.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(null),
    }),
  });
}

function mockFindRows(userIds) {
  TeaBreakReturn.find.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(userIds.map((userId) => ({ userId }))),
    }),
  });
}

describe('teaBreakState durable ended check', () => {
  beforeEach(() => {
    clearTeaBreakState(ANN);
    jest.clearAllMocks();
  });

  test('memory hit does not query TeaBreakReturn', async () => {
    markTeaBreakEnded(ANN, USER_A);
    const ended = await hasEmployeeEndedTeaBreak(ANN, USER_A);
    expect(ended).toBe(true);
    expect(TeaBreakReturn.findOne).not.toHaveBeenCalled();
  });

  test('memory miss falls back to TeaBreakReturn and hydrates cache', async () => {
    mockFindOneHit();
    expect(hasTeaBreakEnded(ANN, USER_A)).toBe(false);
    const ended = await hasEmployeeEndedTeaBreak(ANN, USER_A);
    expect(ended).toBe(true);
    expect(TeaBreakReturn.findOne).toHaveBeenCalledTimes(1);
    expect(hasTeaBreakEnded(ANN, USER_A)).toBe(true);

    const again = await hasEmployeeEndedTeaBreak(ANN, USER_A);
    expect(again).toBe(true);
    expect(TeaBreakReturn.findOne).toHaveBeenCalledTimes(1);
  });

  test('no TeaBreakReturn record means not ended', async () => {
    mockFindOneMiss();
    const ended = await hasEmployeeEndedTeaBreak(ANN, USER_B);
    expect(ended).toBe(false);
    expect(hasTeaBreakEnded(ANN, USER_B)).toBe(false);
  });

  test('loadEndedEmployeeIdsFromDb hydrates every returned user', async () => {
    mockFindRows([USER_A, USER_B]);
    const ids = await loadEndedEmployeeIdsFromDb(ANN);
    expect(ids).toEqual(new Set([USER_A, USER_B]));
    expect(hasTeaBreakEnded(ANN, USER_A)).toBe(true);
    expect(hasTeaBreakEnded(ANN, USER_B)).toBe(true);
    const count = await hydrateEndedStateFromDb(ANN);
    expect(count).toBe(2);
  });
});
