import { describe, expect, it } from 'vitest';
import { moveInOrder } from '../use-profile-grid-move';

describe('moveInOrder', () => {
  const order = [10, 20, 30, 40, 50];
  it('puts the post right after the nearest known post before its new place', () => {
    expect(moveInOrder(order, 50, [10])).toEqual([10, 50, 20, 30, 40]);
    expect(moveInOrder(order, 10, [40, 30, 20])).toEqual([20, 30, 40, 10, 50]);
    // 99 is a scheduled post the order does not hold yet.
    expect(moveInOrder(order, 50, [99, 20, 10])).toEqual([10, 20, 50, 30, 40]);
  });
  it('puts the post first when nothing known is before it', () => {
    expect(moveInOrder(order, 30, [])).toEqual([30, 10, 20, 40, 50]);
    expect(moveInOrder(order, 30, [99])).toEqual([30, 10, 20, 40, 50]);
  });
  it('refuses a post that is not in the saved list', () => {
    expect(moveInOrder(order, 99, [10])).toBeNull();
  });
});
