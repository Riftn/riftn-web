import { describe, expect, it } from 'vitest';
import { moveInOrder } from '../use-profile-grid-move';

describe('moveInOrder', () => {
  const order = [10, 20, 30, 40, 50];
  it('puts the post right after the one it now follows', () => {
    expect(moveInOrder(order, 50, 10)).toEqual([10, 50, 20, 30, 40]);
    expect(moveInOrder(order, 10, 40)).toEqual([20, 30, 40, 10, 50]);
  });
  it('puts the post first when nothing is before it', () => {
    expect(moveInOrder(order, 30, null)).toEqual([30, 10, 20, 40, 50]);
  });
  it('keeps posts the grid has not loaded in their places', () => {
    expect(moveInOrder(order, 20, 30)).toEqual([10, 30, 20, 40, 50]);
  });
  it('refuses a post or a neighbour that is not in the saved list', () => {
    expect(moveInOrder(order, 99, 10)).toBeNull();
    expect(moveInOrder(order, 20, 99)).toBeNull();
  });
});
